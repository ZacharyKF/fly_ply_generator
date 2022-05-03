import MakerJs, { IModel, IModelMap, IPoint, model, models, point } from "makerjs";
import BezierJs, { Projection, Bezier, Point, utils, Closest, Line, Arc } from "bezier-js";
import { bezierjs_to_beziercurve_dimm, flatten_bezier, flatten_bezierjs, flatten_point, get_bezier_t_at_dimm_dist, point_dist, point_to_ipoint, project_bezier_to_dimm } from "./makerjs_tools";
import * as fs from "fs";
import { get_hull_curves_at_dist } from "./bezier_path_hull";
import { abs, cos, flatten, floor, max, min, number, pi, sign, sin } from "mathjs";
import { apply_vector_mul, as_unit, bezier_controls_from_line_points, bezier_length, circle_angle_bezierjs, circle_from_points, circle_point_bezierjs, dist, point_add, point_cross, point_cross_center, point_cross_center_2d, point_dot, point_dot_a, point_mul, point_sub, point_vec_dot_norm, pythag_a_b, pythag_h_a, rot_point_ninty_clock, rot_point_ninty_cnt_clock } from "./math";
import { CatmullRom } from "./catmull_rom";

const LEE_COLOR = "blue";
const WIND_COLOR = "purple";

interface FlattenNode {
    start_seg_idx: number,
    draw_up: boolean,
    reference_point: Point,
    ref_dir_upper: number,
    ref_dir_lower: number,
    upper_bound: (dist: number) => number,
    lower_bound: (dist: number) => number,
    children: FlattenNode[],
    upper_nodes: Point[],
    lower_nodes: Point[],
}

interface DrawPoints {
    lines: Point[],
    starts: Point[],
    ends: Point[],
}

interface HullSegment {
    dist: number,
    hull_curve: Bezier,
}


interface Interval {
    start: number,
    end: number,
}

interface BezierOffsetIntervals {
    dist: number,
    seg_idx: number,
    intervals: Interval[],
}

interface BezierOffsetInterval {
    dist: number,
    seg_idx: number,
    interval: Interval,
}

interface HullCatmullRom {
    start_seg_idx: number,
    end_seg_idx: number,
    t_curve: CatmullRom,
}

export interface BoxedPathHull {
    gunnel_curve_lee: Bezier,
    gunnel_curve_wind: Bezier,
    bilge_curve: Bezier,
    control_curve: Bezier,
    length: number,
    tumblehome: Bezier,
    lee_segments: HullSegment[],
    wind_segments: HullSegment[],
    lee_curves: HullCatmullRom[],
    wind_curves: HullCatmullRom[],
}

export function build_boxed_hull(
    gunnel_points_lee: Point[],
    gunnel_points_wind: Point[],
    bilge_points: Point[],
    control_points: Point[],
    length: number,
    tumblehome_points: Point[],
    precision: number,
    threshold: number,
): BoxedPathHull {

    // First create the hull without our beziers
    let boxed_hull: BoxedPathHull = {
        gunnel_curve_lee: new Bezier(gunnel_points_lee),
        gunnel_curve_wind: new Bezier(gunnel_points_wind),
        bilge_curve: new Bezier(bilge_points),
        control_curve: new Bezier(control_points),
        length: length,
        tumblehome: new Bezier(tumblehome_points),
        lee_segments: [],
        wind_segments: [],
        lee_curves: [],
        wind_curves: [],
    };

    // Now we want to create N (precision) segments. Each segment is taken by getting the arcs at a particular point,
    //  and assigning them to the same number as the closest previous segment. For simplicity, segments are only logged
    //  if a change occurs. A threshold of 5% is used to detect changes 
    let segments_lee: HullSegment[] = [];
    let segments_wind: HullSegment[] = [];

    let offsets_lee : BezierOffsetIntervals[] = [];
    let offsets_wind: BezierOffsetIntervals[] = [];

    let step = 1.0 / precision;
    for (let i = 0.0; i <= 1.0; i += step) {

        let { lee, dist_lee, wind, dist_wind } = hull_curve_at_t(boxed_hull, i);

        let split_curve_lee = split_curve_by_arcs(dist_lee, lee, threshold, segments_lee.length);
        let split_curve_wind = split_curve_by_arcs(dist_wind, wind, threshold, segments_wind.length);

        segments_lee.push(split_curve_lee.new_segment);
        segments_wind.push(split_curve_wind.new_segment);

        offsets_lee.push(split_curve_lee.offsets);
        offsets_wind.push(split_curve_wind.offsets);
    }

    boxed_hull.lee_segments = segments_lee;
    boxed_hull.wind_segments = segments_wind;

    boxed_hull.lee_curves = process_segments_into_hull_bezier(offsets_lee);
    boxed_hull.wind_curves = process_segments_into_hull_bezier(offsets_wind);

    return boxed_hull;
}

function process_segments_into_hull_bezier(offsets: BezierOffsetIntervals[]): HullCatmullRom[] {

    // This is an array that we'll fill by matching segments appropiately to their parent beziers
    let curve_point_list: {
        last_idx: number,
        last_interval: Interval,
        owned_offsets: BezierOffsetInterval[],
    }[] = [];

    let prev_offset = offsets[0];
    
    prev_offset.intervals.forEach(interval => {
        curve_point_list.push({
            last_idx: 0,
            last_interval: interval,
            owned_offsets: [{
                dist: prev_offset.dist,
                seg_idx: prev_offset.seg_idx,
                interval,
            }]
        });
    });

    for(let i = 1; i < offsets.length; i++){
        let offset = offsets[i];
        
        // We need to match, or not match all our intervals
        for(let interval of offset.intervals) {

            let largest_overlap = 0;
            let largest_overlap_idx = 0;

            curve_point_list.forEach((bezier, idx) => {

                // Ignore beziers that have been ended
                if (bezier.last_idx == i - 1) {
                    let overlap = min(interval.end, bezier.last_interval.end) -
                        max(interval.start, bezier.last_interval.start);

                    if (overlap > 0 && overlap > largest_overlap) {
                        largest_overlap = overlap;
                        largest_overlap_idx = idx;
                    }
                }
            });

            if (largest_overlap > 0) {
                curve_point_list[largest_overlap_idx].last_idx = i;
                curve_point_list[largest_overlap_idx].last_interval = interval;
                curve_point_list[largest_overlap_idx].owned_offsets.push({
                    dist: offset.dist,
                    seg_idx: offset.seg_idx,
                    interval: interval,
                });
            }
        }

        prev_offset = offset;
    }

    curve_point_list.forEach(curve => {

        if (curve.owned_offsets.length < 3) {
            return;
        }
        
        // First we need to map the offsets to points
        let points : {p: Point, idx: number}[] = curve.owned_offsets.map((offset, idx) => {
            return {
                p: {
                    x: offset.dist,
                    y: offset.interval.end,
                },
                idx,
            }
        });

        // Now, since we're dealing with a convex curve, we can abuse the fact that the angle between the midpoint, our
        //  current point, and the test point, must be maximized
        let center = point_mul(0.5, point_add(points[0].p, points[points.length -1].p));
        {
            let furthest_idx = 0;
            let smallest_angle = 2 ** 63;
            for (let i = 1; i < points.length - 1; i++ ) {
                let angle = point_dot_a(points[i].p, points[0].p, points[points.length -1].p);
                if (angle < smallest_angle) {
                    smallest_angle = angle;
                    furthest_idx = i;
                }
            }
            center = circle_from_points(points[0].p, points[furthest_idx].p, points[points.length -1].p);
        }
        
        // Our final list of valid points
        let hull: {p: Point, idx: number}[] = [points[0]];

        let idx = 0;
        let last_point = points[idx];
        let vec_last, vec_next, test_angle, temp_angle;
        do {

            vec_last = point_sub(center, last_point.p);
            test_angle = 0;

            for(let i = idx + 1; i < points.length; i++){

                vec_next = point_sub(points[i].p, last_point.p);
                temp_angle = Math.acos(point_vec_dot_norm(vec_last, vec_next));

                if (temp_angle < test_angle) {
                    continue;
                }

                test_angle = temp_angle;
                idx = i;
            }
            
            last_point = points[idx];
            hull.push(last_point);
        } while (idx < points.length - 1);

        curve.owned_offsets = hull.map(hull_point => {
                return curve.owned_offsets[hull_point.idx];
        });
    });

    let hull_curves: HullCatmullRom[] = curve_point_list.map(curve => {

        let t_points: Point[] = curve.owned_offsets.map(offest => {
            return {
                x: offest.dist,
                y: offest.interval.end,
            };
        });

        let t_curve = new CatmullRom(t_points, 0.5, true);

        return {
            start_seg_idx: curve.owned_offsets[0].seg_idx,
            end_seg_idx: curve.owned_offsets[curve.owned_offsets.length - 1].seg_idx,
            t_curve,
        }
    });

    return hull_curves;
}

function split_curve_by_arcs(dist: number, curve: Bezier, threshold: number, seg_idx: number): 
{
    new_segment: HullSegment,
    offsets: BezierOffsetIntervals,
} {

    let flatten = (point: Point) => flatten_point(point, 0);
    let flattened_curve = new Bezier(curve.points.map(flatten));
    let arcs = flattened_curve.arcs(threshold);
    arcs.pop();

    // We want to ignore the gunnel and bow curves
    let offsets = {
        dist,
        seg_idx,
        intervals: arcs.map(arc => {
            return arc.interval;
        }),
    };

    let new_segment: HullSegment = {
        dist,
        hull_curve: curve,
    };

    return {
        new_segment,
        offsets,
    }
}

export function draw_hull_curves(hull: BoxedPathHull, dimm: number): { 
    lee: IModel,
    wind: IModel,
} {

    let lee_curves: IModelMap = {};
    let wind_curves: IModelMap = {};

    let map_bezier_onto_segments = (segments: HullSegment[], hull_curve: HullCatmullRom): IModel  => {
        let points_to_draw: Point[] = [];
        for (let i = hull_curve.start_seg_idx; i <= hull_curve.end_seg_idx; i++){
            let segment = segments[i];
            let t = hull_curve.t_curve.get_at_dimm_dist(0, segment.dist);
            let point_3d = segment.hull_curve.get(t.y);
            let point_2d = flatten_point(point_3d, dimm);
            points_to_draw.push(point_2d);
        }
        return new models.ConnectTheDots(false, points_to_draw.map(point_to_ipoint));
    }

    hull.lee_curves.forEach((curve, idx) => {
        let drawn_curve: IModel = map_bezier_onto_segments(hull.lee_segments, curve);
        lee_curves["lee_hull_" + idx] = { layer: "red", ...drawn_curve };
    });

    hull.wind_curves.forEach((curve, idx) => {
        let drawn_curve: IModel = map_bezier_onto_segments(hull.wind_segments, curve);
        wind_curves["wind_hull_" + idx] = { layer: "green", ...drawn_curve };
    });

    return {
        lee: { models: lee_curves },
        wind: { models: wind_curves },
    }
}

export function draw_main_curves(hull: BoxedPathHull, dimm: number): IModel {

    let gunnel_lee: models.BezierCurve = bezierjs_to_beziercurve_dimm(hull.gunnel_curve_lee, dimm);
    let gunnel_wind: models.BezierCurve = bezierjs_to_beziercurve_dimm(hull.gunnel_curve_wind, dimm);
    let bilge: models.BezierCurve = bezierjs_to_beziercurve_dimm(hull.bilge_curve, dimm);

    return {
        models: {
            gunnel_lee,
            gunnel_wind,
            bilge
        }
    }
}

function fill_node(node: FlattenNode, segments: HullSegment[], idx_end: number): {
    ref_dir_upper: number,
    ref_dir_lower: number,
} {

    let reference = node.reference_point;
    let ref_dir_upper = node.ref_dir_upper;
    let ref_dir_lower = node.ref_dir_lower;
    let prev_seg = segments[node.start_seg_idx];
    let bezier_b = bound_segment_with_flatten_node(prev_seg, node);

    for (let i = node.start_seg_idx - 1; i >= idx_end; i--) {
        let segment = segments[i];
        let bezier_a = bound_segment_with_flatten_node(segment, node);

        if (node.draw_up) {

            let flattened = unroll_point_set(
                bezier_a.getLUT(),
                bezier_b.getLUT(),
                reference,
                ref_dir_lower,
                false
            );

            node.upper_nodes.push(flattened.a_flat[flattened.a_flat.length - 1]);
            node.lower_nodes.push(flattened.a_flat[0]);

            reference = flattened.a_flat[0];
            ref_dir_lower = flattened.f1f4_dir;
            ref_dir_upper = flattened.fnfn_less1_dir;

        } else if (!node.draw_up) {

            let flattened = unroll_point_set(
                bezier_a.getLUT().reverse(),
                bezier_b.getLUT().reverse(),
                reference,
                ref_dir_upper,
                true
            );

            node.upper_nodes.push(flattened.a_flat[0]);
            node.lower_nodes.push(flattened.a_flat[flattened.a_flat.length - 1]);
            
            reference = flattened.a_flat[0];
            ref_dir_lower = flattened.fnfn_less1_dir;
            ref_dir_upper = flattened.f1f4_dir;
        }

        prev_seg = segment;
        bezier_b = bezier_a;
    }

    return {
        ref_dir_upper,
        ref_dir_lower,
    }
}

export function draw_flattened_hull(hull: BoxedPathHull): { lee: IModel, wind: IModel } {
    /**
    * We need to build the initial node. The key here is that the segment will be drawn along the line from start to 
    *  end. Start is CLOSER TO THE BOW, while end is CLOSER TO THE STERN. End is assumed to be 0, then updated during 
    *  the addition of children. It's important to note that draw_start & draw_vec are in a different basis than the 
    *  original hull.
    * 
    * For consistency, nodes closer to the stern will be drawn TOWARDS THE NEGATIVE X DIRECTION
    */
    let build_initial_node = (segments: HullSegment[]): FlattenNode => {
        return {
            start_seg_idx: segments.length - 1,
            draw_up: false,
            reference_point: { x: 0, y: 0 },
            ref_dir_upper: 3.0 * pi / 2.0,
            ref_dir_lower: pi / 2.0,
            upper_bound: (dist: number) => 1.0,
            lower_bound: (dist: number) => 0.0,
            children: [],
            upper_nodes: [],
            lower_nodes: [],
        }
    }
    let lee_initial_node = build_initial_node(hull.lee_segments);
    let wind_initial_node = build_initial_node(hull.wind_segments);

    /**
     * Now for the node insertion, what we do is repetitively take the closest bezier that's within our node's bounds at
     *  their endpoint, create two nodes based on it, remove the parent from the original node list, and add the new 
     *  children.
     */
    let populate_nodes = (initial_node: FlattenNode, segments: HullSegment[], beziers: HullCatmullRom[]) => {

        // We want to process the beziers in order from closes to bow back
        let bezier_sort = (a: HullCatmullRom, b: HullCatmullRom) => { return b.end_seg_idx - a.end_seg_idx; };
        let sorted_beziers = beziers.sort(bezier_sort);

        // As we create children, their parents will be removed from here, and the new nodes will get added
        let nodes_to_consider = [initial_node];

        let try_index = 0;
        while (sorted_beziers.length > 0) {

            // First try and find an appropriate bezier. If we can't find one there's likely something wrong
            let next_bezier = sorted_beziers[try_index];
            let bezier_t_end = next_bezier.t_curve.get(1.0);
            let bezier_end_t = bezier_t_end.y;
            let bezier_end_x = bezier_t_end.x;
            let node_index = nodes_to_consider.findIndex((node) => {
                return bezier_end_t < node.upper_bound(bezier_end_x) &&
                        bezier_end_t > node.lower_bound(bezier_end_x)
            });

            // If for some reason no overlapping node is found, then we should increment the count. But it's likely that
            //  this is a bug.
            if (node_index < 0) {
                console.error("Failed to find overlapping node for t: " + bezier_end_t);
                try_index += 1;
                continue;
            }

            // Ensure the arrays have their elements removed, and reset the index
            sorted_beziers.splice(try_index, 1);
            let parent_node = nodes_to_consider.splice(node_index, 1)[0];
            try_index = 0;

            // This may seem counter intuitive, but it's just saying "the parent stops where it meets the curve"
            let new_dirs = fill_node(parent_node, segments, next_bezier.end_seg_idx + 1);

            // With the parent node in hand we need to define our curve bound. This lets us find the curve t value at an
            //  arbitrary point along the hull
            let curve_bound = (dist: number) => next_bezier.t_curve.get_at_dimm_dist(0, dist).y;

            // Keep track of how the direction is flipping, the end of one node is the start of another (until the leaf
            //  nodes, which ACTUALLY end at 0)
            let new_upper: FlattenNode = {
                start_seg_idx: next_bezier.end_seg_idx,
                draw_up: false,
                reference_point: parent_node.upper_nodes[parent_node.upper_nodes.length - 1],
                ref_dir_upper: new_dirs.ref_dir_upper,
                ref_dir_lower: 0, // Won't actually be used
                upper_bound: parent_node.upper_bound,
                lower_bound: curve_bound,
                children: [],
                upper_nodes: [],
                lower_nodes: [],
            }
            parent_node.children.push(new_upper);
            nodes_to_consider.push(new_upper);

            let new_lower: FlattenNode = {
                start_seg_idx: next_bezier.end_seg_idx,
                draw_up: true,
                reference_point: parent_node.lower_nodes[parent_node.lower_nodes.length - 1],
                ref_dir_upper: 0, // Won't actually be used
                ref_dir_lower: new_dirs.ref_dir_lower,
                upper_bound: curve_bound,
                lower_bound: parent_node.lower_bound,
                children: [],
                upper_nodes: [],
                lower_nodes: [],
            }
            parent_node.children.push(new_lower);
            nodes_to_consider.push(new_lower);
        }

        nodes_to_consider.forEach(node => fill_node(node, segments, 0));
    }

    populate_nodes(lee_initial_node, hull.lee_segments, hull.lee_curves);
    populate_nodes(wind_initial_node, hull.wind_segments, hull.wind_curves);

    // To draw we just need to do a fairly simple recurvive descent, then map the points accordingly
    let lee = flatten_node_to_points(lee_initial_node, { lines: [], starts: [], ends: [] });
    let wind = flatten_node_to_points(wind_initial_node, { lines: [], starts: [], ends: [] });

    return {
        lee: {
            layer: LEE_COLOR, ...new models.ConnectTheDots(true, lee.lines.map(point_to_ipoint)),
            models: {
                starts: { layer: "green", ... new models.Holes(0.0625, lee.starts.map(point_to_ipoint)) },
                ends: { layer: "red", ... new models.Holes(0.0625, lee.ends.map(point_to_ipoint)) },
            }
        },
        wind: {
            layer: WIND_COLOR, ...new models.ConnectTheDots(true, wind.lines.map(point_to_ipoint)),
            models: {
                starts: { layer: "green", ... new models.Holes(0.0625, wind.starts.map(point_to_ipoint)) },
                ends: { layer: "red", ... new models.Holes(0.0625, wind.ends.map(point_to_ipoint)) },
            }
        },
    };
}

function flatten_node_to_points(node: FlattenNode, draw_arrays: DrawPoints): DrawPoints {

    draw_arrays.lines = draw_arrays.lines.concat(node.upper_nodes);
    draw_arrays.starts.push(node.upper_nodes[0]);
    draw_arrays.ends.push(node.upper_nodes[node.upper_nodes.length - 1]);

    node.children.forEach((child) => {
        flatten_node_to_points(child, draw_arrays);
    });

    let reversed_lower = node.lower_nodes.reverse();
    draw_arrays.lines = draw_arrays.lines.concat(reversed_lower);
    draw_arrays.starts.push(reversed_lower[0]);
    draw_arrays.ends.push(reversed_lower[reversed_lower.length - 1]);

    return draw_arrays;
}

// p1 is the flattened point from the top right of the bezier, everything is unrolled from this point, it returns the
//  flattened point arrays of both
function unroll_point_set(a: Point[], b: Point[], f2_init: Point, f2f3_ang: number, clockwise: boolean): {
    a_flat: Point[],
    b_flat: Point[],
    f1f4_dir: number,
    fnfn_less1_dir: number,
} {

    /**
     * CLOCKWISE
     * a    b
     * 1    2
     * 
     * 4    3
     * 
     * - f2f3_ang refers to the initial direction of f2 -> f3
     * - clockwise refers to the rotational direction between f2f3_ang & vf2f1, the case above is the true case
     * 
     * The return reference dir is the direction between f1 & f4 of the first quad
     * 
     * COUNTER-CLOCKWISE
     * 
     * 4    3
     * 
     * 1    2
     * a    b
     */

    // Our arrays to populate
    let a_flat: Point[] = [];
    let b_flat: Point[] = [];

    // Initial points
    let p1 = a[0];
    let p2 = b[0];

    // Calculate f2, this is a pretty similar operation to the loop body
    let f2 = f2_init;
    let f1 = { x: 0, y: 0 };
    {
        let p3 = b[1];
        let t2 = point_dot_a(p2, p3, p1);
        let d12 = point_dist(p1, p2);

        if (clockwise) {
            f1 = circle_point_bezierjs(f2, d12, f2f3_ang - t2);
        } else {
            f1 = circle_point_bezierjs(f2, d12, f2f3_ang + t2);
        }
    }

    a_flat.push(f1);
    b_flat.push(f2);

    for (let i = 1; i < a.length; i++) {
        let p4 = a[i];
        let p3 = b[i];

        let txf1 = circle_angle_bezierjs(f1, f2);
        let txf2 = circle_angle_bezierjs(f2, f1);

        let t1 = point_dot_a(p1, p2, p4);
        let t2 = point_dot_a(p2, p1, p3);

        let d14 = point_dist(p1, p4);
        let d23 = point_dist(p2, p3);

        if (clockwise) {
            f1 = circle_point_bezierjs(f1, d14, txf1 - t1);
            f2 = circle_point_bezierjs(f2, d23, txf2 + t2);
        } else {
            f1 = circle_point_bezierjs(f1, d14, txf1 + t1);
            f2 = circle_point_bezierjs(f2, d23, txf2 - t2);
        }

        a_flat.push(f1);
        b_flat.push(f2);

        p1 = p4;
        p2 = p3;
    }

    let f1f4_dir = circle_angle_bezierjs(a_flat[0], a_flat[1]);
    let fnfn_less1_dir = circle_angle_bezierjs(a_flat[a_flat.length - 1], a_flat[a_flat.length - 2]);

    return {
        a_flat,
        b_flat,
        f1f4_dir,
        fnfn_less1_dir,
    }

}

function bound_segment_with_flatten_node(segment: HullSegment, node: FlattenNode): Bezier {
    let upper_bound = node.upper_bound(segment.dist);
    let lower_bound = node.lower_bound(segment.dist);
    return segment.hull_curve.split(lower_bound, upper_bound);
}

export function hull_curve_at_t(hull: BoxedPathHull, t_gunnel: number): {
    lee: Bezier,
    dist_lee: number,
    wind: Bezier,
    dist_wind: number,
} {

    // Dist is based on a t-value from the gunnel
    let dist_lee = hull.gunnel_curve_lee.get(t_gunnel).x;
    let dist_wind = hull.gunnel_curve_wind.get(t_gunnel).x;

    let gunnel_lee: Point = project_bezier_to_dimm(hull.gunnel_curve_lee, 0, dist_lee);
    let gunnel_wind: Point = project_bezier_to_dimm(hull.gunnel_curve_wind, 0, dist_wind);
    
    let bilge_lee: Point = project_bezier_to_dimm(hull.bilge_curve, 0, dist_lee);
    let bilge_wind: Point = project_bezier_to_dimm(hull.bilge_curve, 0, dist_wind);

    let control: Point = hull.control_curve.compute(t_gunnel);
    let tumblehome: number = 1.0 + (hull.tumblehome.compute(t_gunnel).y / 100.0);

    // create two arrays for the hull curves
    let lee_center: Point = calc_swap_diag(gunnel_lee, bilge_lee, control.y, tumblehome);
    let wind_center: Point = calc_swap_diag(gunnel_wind, bilge_wind, control.y, tumblehome);

    let lee_points: Point[] = [
        bilge_lee,
        lee_center,
        gunnel_lee,
    ];
    let lee = new Bezier(lee_points);

    let wind_points: Point[] = [
        bilge_wind,
        wind_center,
        gunnel_wind,
    ];
    let wind = new Bezier(wind_points);

    return {
        lee,
        dist_lee,
        wind,
        dist_wind,
    }
}

export function split_curve_to_chines(curve: Bezier, chines: number[]): Bezier[] {

    let curves: Bezier[] = [];
    let to_divide = curve;

    chines.forEach(chine => {
        let new_curves = to_divide.split(chine);
        to_divide = new_curves.right;
        curves.push(new_curves.left);
    });
    curves.push(to_divide);

    return curves;
}

export function split_curve_to_natural_arcs(curve: Bezier, threshold: number): Bezier[] {
    let flatten = (point: Point) => flatten_point(point, 0);
    let new_points = curve.points.map(flatten);
    let flattened_curve = new Bezier(new_points);
    let arcs = flattened_curve.arcs(threshold);
    let segments = arcs.map(arc => {
        return curve.split(arc.interval.start, arc.interval.end);
    });
    return segments;
}

function calc_swap_diag(gunnel: Point, bow: Point, mag: number, tumblehome: number): Point {

    if (gunnel.z != undefined && bow.z != undefined) {

        let mid_point: Point = {
            x: (gunnel.x + bow.x) / 2.0,
            y: (gunnel.y + bow.y) / 2.0,
            z: (gunnel.z + bow.z) / 2.0,
        };

        // Since we know that we're projecting onto the YZ plane, we can just negate the Y to rotate
        let vec_diff: Point = {
            x: (gunnel.x - bow.x) / 2.0,
            y: -1.0 * (gunnel.y - bow.y) / 2.0,
            z: (gunnel.z - bow.z) / 2.0,
        };

        // We only care about the YZ magnitude, so we can use that to modify the vector
        let vec_mag = mag / Math.sqrt(vec_diff.x * vec_diff.x + vec_diff.y * vec_diff.y);

        if (vec_diff.z != undefined && mid_point.z != undefined) {
            return {
                x: mid_point.x,
                y: mid_point.y + vec_mag * vec_diff.y,
                z: (mid_point.z + vec_mag * vec_diff.z) * tumblehome,
            }
        }
    }
    return gunnel;
}

export function draw_t_points(hull: BoxedPathHull, dimm: number) : {
    lee_t_lines: IModel,
    wind_t_lines: IModel,
} {

    let lee_t_points: IModelMap = {};
    let wind_t_points: IModelMap = {};

    let find_closest_segment = (segments: HullSegment[], dist: number) : HullSegment => {
        return segments.reduce(({d, seg}, new_seg) => {
            let new_d = abs(new_seg.dist - dist);
            if (new_d < d) {
                return {
                    d: new_d,
                    seg: new_seg,
                }
            }
            return {d, seg};
        }, {d: abs(segments[0].dist - dist), seg: segments[0]}).seg;
    };

    let add_to_modelmap = (modelmap: IModelMap, prefix: string, segments: HullSegment[], curves: HullCatmullRom[]): void => {
        curves.forEach((curve, idx) => {
            let points: Point[] = [];

            curve.t_curve.segments.forEach(segment => {

                let p1_hull = find_closest_segment(segments, segment.p1.x);
                let p2_hull = find_closest_segment(segments, segment.p2.x);

                points.push(p1_hull.hull_curve.get(segment.p1.y));
                points.push(p2_hull.hull_curve.get(segment.p2.y));
            });

            let to_display: IPoint[] = points.map(point => {
                return point_to_ipoint(flatten_point(point, dimm));
            });
            modelmap[prefix + idx] = new models.ConnectTheDots(false, to_display);
        });
    };

    add_to_modelmap(lee_t_points, "lee_t_points_", hull.lee_segments, hull.lee_curves);
    add_to_modelmap(wind_t_points, "wind_t_points_", hull.wind_segments, hull.wind_curves);

    return {
        lee_t_lines: { layer: "fuchsia", models: lee_t_points},
        wind_t_lines: {layer: "lime", models: wind_t_points},
    }
}

export function draw_segments(hull: BoxedPathHull, dimm: number, number_segs: number) : {
    lee_segments: IModel,
    wind_segments: IModel,
} {
    let model_map_lee: IModelMap = {};
    let model_map_wind: IModelMap = {};

    
    let idx_interval = floor(hull.lee_segments.length/number_segs);
    let filter_segment = (segment: HullSegment, idx: number) : boolean => {
        return idx % idx_interval == 0;
    }

    let segment_to_model = (curve : HullSegment) : IModel => {
        let flattened_curve = flatten_bezierjs(curve.hull_curve, dimm);
        return new models.BezierCurve(flattened_curve.points.map(point_to_ipoint));
    };

    let add_to_modelmap = (model_map: IModelMap, prefix: string) : ((model: IModel, idx: number) => void) => {
        return (model: IModel, idx: number) => {
            model_map[prefix + idx] = model;
        }
    };

    hull.lee_segments.filter(filter_segment).map(segment_to_model).forEach(add_to_modelmap(model_map_lee,"lee_hull_curve_"));
    hull.wind_segments.filter(filter_segment).map(segment_to_model).forEach(add_to_modelmap(model_map_wind,"wind_hull_curve_"));

    return {
        lee_segments : { layer: LEE_COLOR, models: model_map_lee },
        wind_segments: { layer: WIND_COLOR, models: model_map_wind},
    }
}