import MakerJs, { IModel, IModelMap, IPoint, models } from "makerjs";
import BezierJs, { Projection, Bezier, Point, utils, Closest, Line, Arc } from "bezier-js";
import { bezierjs_to_beziercurve_dimm, flatten_bezier, flatten_bezierjs, flatten_point, get_bezier_t_at_dimm_dist, point_dist, point_to_ipoint, project_bezier_to_dimm } from "./makerjs_tools";
import * as fs from "fs";
import { get_hull_curves_at_dist } from "./bezier_path_hull";
import { abs, cos, flatten, floor, max, min, number, pi, sin } from "mathjs";
import { apply_vector_mul, as_unit, bezier_length, circle_angle_bezierjs, circle_point_bezierjs, dist, point_dot_a, pythag_a_b, pythag_h_a, rot_point_ninty_clock, rot_point_ninty_cnt_clock } from "./math";

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
    unroll_dist: number,
    xz_intersect: Point,
    xz_intersect_t: number,
    hull_curve: Bezier,
    offsets: { [index: number]: { t: number, d: Point } },
}

interface HullBezier {
    start: number,
    end: number,
    t_curve: Bezier,
    d_curve: Bezier,
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
    lee_beziers: HullBezier[],
    wind_beziers: HullBezier[],
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
        lee_beziers: [],
        wind_beziers: [],
    };

    // Now we want to create N (precision) segments. Each segment is taken by getting the arcs at a particular point,
    //  and assigning them to the same number as the closest previous segment. For simplicity, segments are only logged
    //  if a change occurs. A threshold of 5% is used to detect changes 
    let segments_lee: HullSegment[] = [];
    let segments_wind: HullSegment[] = [];

    let step = 1.0 / precision;
    for (let i = 0.0; i <= 1.0; i += step) {
        let { lee, dist_lee, wind, dist_wind } = hull_curve_at_t(boxed_hull, i);
        segments_lee = add_segment_if_required(dist_lee, lee, threshold, segments_lee);
        segments_wind = add_segment_if_required(dist_wind, wind, threshold, segments_wind);
    }

    boxed_hull.lee_segments = segments_lee;
    boxed_hull.wind_segments = segments_wind;

    boxed_hull.lee_beziers = process_segments_into_hull_bezier(segments_lee);
    boxed_hull.wind_beziers = process_segments_into_hull_bezier(segments_wind);

    return boxed_hull;
}

function process_segments_into_hull_bezier(segments: HullSegment[]): HullBezier[] {

    let bezier_curves: HullBezier[] = [];
    let point_sets: { [idx: number]: { t: Point, d: Point }[] } = {};

    // Remap the segments to a per-line basis
    segments.forEach(segment => {
        for (const key in segment.offsets) {
            let point: Point = {
                x: segment.dist,
                y: segment.offsets[key].t
            };
            if (point_sets[key] == undefined) {
                point_sets[key] = [];
            };
            point_sets[key].push({ t: point, d: segment.offsets[key].d });
        }
    });

    // For a test, take the first, last, and middle
    for (const idx in point_sets) {
        let point_set = point_sets[idx];
        let new_set: { t: Point, d: Point }[] = [];

        let set_to_consider: {
            idx: number,
            delta: number,
            val: { t: Point, d: Point },
        }[] = []

        for (let i = 1; i < point_set.length - 1; i++) {
            let next = point_set[i + 1];
            let curr = point_set[i];

            let t_diff = abs(curr.t.y - next.t.y);

            set_to_consider.push(
                {
                    idx: i,
                    delta: t_diff,
                    val: curr,
                }
            )
        }

        set_to_consider = set_to_consider.sort((a, b) => {
            if (a.delta > b.delta) {
                return -1;
            } else if (a.delta < b.delta) {
                return 1;
            } else {
                return 0;
            }
        })

        set_to_consider = set_to_consider.slice(0, 2);

        set_to_consider = set_to_consider.sort((a, b) => {
            if (a.idx < b.idx) {
                return -1;
            } else if (a.idx > b.idx) {
                return 1;
            } else {
                return 0;
            }
        });

        new_set = new_set.concat(set_to_consider.map(val => val.val));

        new_set.unshift(point_set[0]);
        new_set.push(point_set[point_set.length - 1]);
        point_sets[idx] = new_set;
    }

    // Remap to HullBezier objects
    for (const idx in point_sets) {
        const point_set = point_sets[idx];
        let start = point_set[0].d.x;
        let end = point_set[point_set.length - 1].d.x;
        let new_hull_bezier: HullBezier = {
            start,
            end,
            t_curve: new Bezier(point_set.map(val => val.t)),
            d_curve: new Bezier(point_set.map(val => val.d)),
        };
        bezier_curves.push(new_hull_bezier);
    };

    return bezier_curves;
}

function add_segment_if_required(dist: number, curve: Bezier, threshold: number, segments: HullSegment[]): HullSegment[] {

    let xz_intersect_t = get_bezier_t_at_dimm_dist(curve, 1, 0.0);
    let xz_intersect = flatten_point(curve.get(xz_intersect_t), 1);
    let curves: { t: number, d: Point }[] = [];
    let flatten = (point: Point) => flatten_point(point, 0);
    let new_points = curve.points.map(flatten);
    let flattened_curve = new Bezier(new_points);
    let arcs = flattened_curve.arcs(threshold);

    let temp = arcs.pop();

    // We want to ignore the gunnel and bow curves
    arcs.forEach(arc => {

        let flat_point: Point = flattened_curve.get(arc.interval.end);
        let unflat_point: Point = {
            x: dist,
            y: flat_point.x,
            z: flat_point.y,
        };

        curves.push({
            t: arc.interval.end,
            d: unflat_point,
        });
    });

    if (temp != undefined) {
        arcs.push(temp);
    }
    if (segments.length == 0) {
        // If this is the first set of offsets, just add them
        let new_segment: HullSegment = {
            dist,
            unroll_dist: 0,
            xz_intersect,
            xz_intersect_t,
            hull_curve: curve,
            offsets: [],
        };
        curves.forEach((val, idx) => {
            new_segment.offsets[idx] = val;
        });
        segments.push(new_segment);

    } else {

        // Otherwise we need to remap the indexes based on the previous one
        let next_segment: HullSegment = segments[segments.length - 1];
        let new_offsets: { [index: number]: { t: number, d: Point } } = [];
        curves.forEach((curve, idx) => {
            let closest = 100000000000;
            let closest_idx = idx;
            for (const idx_prev in next_segment.offsets) {
                let dist = abs(curve.t - next_segment.offsets[idx_prev].t);
                if (dist < closest) {
                    closest = dist;
                    closest_idx = +idx_prev;
                }
            }
            new_offsets[closest_idx] = curve;
        });
        let unroll_dist = next_segment.unroll_dist + point_dist(xz_intersect, next_segment.xz_intersect);
        let new_segment: HullSegment = {
            dist,
            unroll_dist,
            xz_intersect,
            xz_intersect_t,
            hull_curve: curve,
            offsets: new_offsets,
        }
        segments.push(new_segment);
    }

    return segments;
}

export function draw_hull_curves(hull: BoxedPathHull, dimm: number): { lee: IModel, wind: IModel } {

    let lee_curves: IModelMap = {};
    let wind_curves: IModelMap = {};

    hull.lee_beziers.forEach((curve, idx) => {
        let drawn_curve: models.BezierCurve = bezierjs_to_beziercurve_dimm(curve.d_curve, dimm);
        lee_curves["lee_hull_" + idx] = { layer: "red", ...drawn_curve };
    });

    hull.wind_beziers.forEach((curve, idx) => {
        let drawn_curve: models.BezierCurve = bezierjs_to_beziercurve_dimm(curve.d_curve, dimm);
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
    let prev_upper_t = node.upper_bound(prev_seg.dist);
    let prev_lower_t = node.lower_bound(prev_seg.dist);
    let revisit_segments: HullSegment[] = [];

    for (let i = node.start_seg_idx - 1; i >= idx_end; i--) {
        
        let segment = segments[i];
        let bezier_a = bound_segment_with_flatten_node(segment, node);

        /**
         * Some segments overlap the gunnels. When a segment does, it needs to be divided into an up segment and down
         *  segment. Both share a reference point along the y = 0/unroll curve, rather than simply taking the reference
         *  point of the node. 
         */
        let segment_upper_t = node.upper_bound(segment.dist);
        let segment_lower_t = node.lower_bound(segment.dist);
        if (bezier_a.lower_bezier != undefined && bezier_b.lower_bezier != undefined) {

            reference = {
                x: segment.unroll_dist,
                y: 0,
            }

            if (prev_seg.xz_intersect_t > 0.0) {

                let bezier_up_a = segment.hull_curve.split(segment.xz_intersect_t, segment_upper_t);
                let bezier_up_b = prev_seg.hull_curve.split(prev_seg.xz_intersect_t, prev_upper_t);

                let flattened_up = unroll_point_set(
                    bezier_up_a.getLUT(),
                    bezier_up_b.getLUT(),
                    reference,
                    pi / 2.0,
                    false,
                );
                node.upper_nodes.push(flattened_up.a_flat[flattened_up.a_flat.length - 1]);

                let bezier_down_a = segment.hull_curve.split(segment_lower_t, segment.xz_intersect_t);
                let bezier_down_b = prev_seg.hull_curve.split(prev_lower_t, prev_seg.xz_intersect_t);
                
                let flattened_down = unroll_point_set(
                    bezier_down_a.getLUT().reverse(),
                    bezier_down_b.getLUT().reverse(),
                    reference,
                    3.0 * pi / 2.0,
                    true,
                );
                node.lower_nodes.push(flattened_down.a_flat[flattened_down.a_flat.length - 1]);

                ref_dir_upper = flattened_up.fnfn_less1_dir;
                ref_dir_lower = flattened_down.fnfn_less1_dir;

                if (node.draw_up) {
                    reference = flattened_down.a_flat[flattened_down.a_flat.length - 1];
                } else {
                    reference = flattened_up.a_flat[flattened_up.a_flat.length - 1];
                }

                // With a valid reference point we can now iterate through the revisit_segments. These are generally the
                //  bow points near the end of the hull. For simplicity we'll just roll these down
                if (revisit_segments.length > 1) {
                    let revisit_up: Point[] = [];
                    let revisit_down: Point[] = [];
                    let revisit_ref: Point = node.upper_nodes[0];
                    let revisit_ref_dir: number = ref_dir_upper;
                    console.log(revisit_ref, revisit_ref_dir)

                    let prev_revisit = revisit_segments[0];
                    for(let i = 1; i < revisit_segments.length; i++) {
                        let revisit = revisit_segments[i];

                        let bezier_revisit_a = bound_segment_with_flatten_node(revisit, node);
                        let bezier_revisit_b = bound_segment_with_flatten_node(prev_revisit, node);

                        let flatten_revisit = unroll_point_set(
                            bezier_revisit_a.upper_bezier.getLUT().reverse(),
                            bezier_revisit_b.upper_bezier.getLUT().reverse(),
                            revisit_ref,
                            revisit_ref_dir,
                            false,                               
                        );

                        revisit_up.push(flatten_revisit.a_flat[0]);
                        revisit_down.push(flatten_revisit.a_flat[flatten_revisit.a_flat.length - 1]);
                        revisit_ref_dir = flatten_revisit.f1f4_dir;
                        revisit_ref = flatten_revisit.a_flat[0];

                        prev_revisit = revisit;
                    }

                    node.upper_nodes = revisit_up.reverse().concat(node.upper_nodes);
                    node.lower_nodes = revisit_down.reverse().concat(node.lower_nodes);
                    revisit_segments = [];
                }
            } else {

                // If we've  found a segment above the "unroll" line, we'll need to revisit it to draw it properly
                revisit_segments.unshift(prev_seg);
            }
        } else if (node.draw_up) {
            
            let flattened = unroll_point_set(
                bezier_a.upper_bezier.getLUT(),
                bezier_b.upper_bezier.getLUT(),
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
                bezier_a.upper_bezier.getLUT().reverse(),
                bezier_b.upper_bezier.getLUT().reverse(),
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

        prev_upper_t = segment_upper_t;
        prev_lower_t = segment_lower_t;
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
        let init_segment = segments[segments.length - 1];
        let draw_start_x = init_segment.unroll_dist;
        return {
            start_seg_idx: segments.length - 1,
            draw_up: false,
            reference_point: { x: draw_start_x, y: 0 },
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
    let populate_nodes = (initial_node: FlattenNode, segments: HullSegment[], beziers: HullBezier[]) => {

        // We want to process the beziers in order from closes to bow back
        let bezier_sort = (a: HullBezier, b: HullBezier) => { return b.end - a.end; };
        let sorted_beziers = beziers.sort(bezier_sort);

        // As we create children, their parents will be removed from here, and the new nodes will get added
        let nodes_to_consider = [initial_node];

        let try_index = 0;
        while (sorted_beziers.length > 0) {

            // First try and find an appropriate bezier. If we can't find one there's likely something wrong
            let next_bezier = sorted_beziers[try_index];
            let bezier_end_t = next_bezier.t_curve.get(1.0).y;
            let node_index = nodes_to_consider.findIndex((node) => {
                return bezier_end_t < node.upper_bound(next_bezier.end) &&
                    bezier_end_t > node.lower_bound(next_bezier.end)
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
            let child_start_segment = closest_segment(segments, next_bezier.end);
            let new_dirs = fill_node(parent_node, segments, child_start_segment.idx + 1);

            // With the parent node in hand we need to define our curve bound. This lets us find the curve t value at an
            //  arbitrary point along the hull
            let curve_bound = (dist: number) => project_bezier_to_dimm(next_bezier.t_curve, 0, dist).y;

            // Keep track of how the direction is flipping, the end of one node is the start of another (until the leaf
            //  nodes, which ACTUALLY end at 0)
            let new_upper: FlattenNode = {
                start_seg_idx: child_start_segment.idx,
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
                start_seg_idx: child_start_segment.idx,
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

    populate_nodes(lee_initial_node, hull.lee_segments, hull.lee_beziers);
    populate_nodes(wind_initial_node, hull.wind_segments, hull.wind_beziers);

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

function bound_segment_with_flatten_node(segment: HullSegment, node: FlattenNode): {
    upper_bezier : Bezier,
    lower_bezier? : Bezier,
} {
    let upper_bound = node.upper_bound(segment.dist);
    let lower_bound = node.lower_bound(segment.dist);
    if (upper_bound > segment.xz_intersect_t && lower_bound < segment.xz_intersect_t) {
        return {
            upper_bezier: segment.hull_curve.split(segment.xz_intersect_t, upper_bound),
            lower_bezier: segment.hull_curve.split(lower_bound, segment.xz_intersect_t),
        }

    }

    return {
        upper_bezier: segment.hull_curve.split(lower_bound, upper_bound),
    }
}

function closest_segment(segments: HullSegment[], dist_x: number): { segment: HullSegment, idx: number } {
    return segments.reduce(
        ({ segment, idx, dist }, test_segment, test_idx) => {
            let test_dist = abs(test_segment.dist - dist_x);
            if (test_dist < dist) {
                return {
                    segment: test_segment,
                    idx: test_idx,
                    dist: test_dist
                }
            }
            return { segment, idx, dist }
        }, { segment: segments[0], idx: 0, dist: abs(segments[0].dist - dist_x) }
    )
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