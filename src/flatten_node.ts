import { IModel, IModelMap, model } from "makerjs";
import { points_to_imodel, point_path_to_puzzle_teeth } from "./makerjs_tools";
import { HullSegment } from "./rational_bezier_hull";
import { middle_value, unroll_point_set } from "./rational_math";
import { Point2D, Point3D } from "./rational_point";
import { HullCurve, Interval } from "./segmented_hull";

export class FlattenNode {
    prefix: string;
    depth: number;
    idx: number;
    start_seg_idx: number;
    draw_up: boolean;
    reference_point: Point2D;
    draw_up_ref_dir: number;
    draw_down_ref_dir: number;
    upper_bound: (dist: number) => number;
    lower_bound: (dist: number) => number;
    children: FlattenNode[];
    start: Point2D[];
    upper_nodes: Point2D[];
    lower_nodes: Point2D[];
    bulkheads: Point2D[][];

    constructor(
        prefix: string,
        depth: number,
        idx: number,
        start_seg_idx: number,
        draw_up: boolean,
        reference_point: Point2D,
        draw_up_ref_dir: number,
        draw_down_ref_dir: number,
        upper_bound: (dist: number) => number,
        lower_bound: (dist: number) => number
    ) {
        this.prefix = prefix;
        this.depth = depth;
        this.idx = idx;
        this.start_seg_idx = start_seg_idx;
        this.draw_up = draw_up;
        this.reference_point = reference_point;
        this.draw_up_ref_dir = draw_up_ref_dir;
        this.draw_down_ref_dir = draw_down_ref_dir;
        this.upper_bound = upper_bound;
        this.lower_bound = lower_bound;
        this.children = [];
        this.upper_nodes = [];
        this.lower_nodes = [];
        this.bulkheads = [];
        this.start = [];
    }

    draw_node(): IModel {
        let to_draw: Point2D[] = [...this.upper_nodes];

        this.children.forEach((child) => {
            if (!child.draw_up) {
                to_draw.push(...child.start);
            } else {
                to_draw.push(...[...child.start].reverse());
            }
        });

        to_draw.push(...[...this.lower_nodes].reverse());

        if (this.draw_up) {
            to_draw.push(...this.start);
        } else {
            to_draw.push(...[...this.start].reverse());
        }

        let bulkheads: IModelMap = {};
        this.bulkheads.forEach((bulkhead, idx) => {
            let model = points_to_imodel(2, false, bulkhead);
            model.layer = "blue";
            bulkheads["bulkhead_" + idx] = model;
        });

        let box: IModel = {
            ...points_to_imodel(2, false, to_draw),
            models: bulkheads,
        };

        let caption_point = middle_value(this.upper_nodes)
            .add(middle_value(this.lower_nodes))
            .div(2)
            .to_ipoint(2);

        model.addCaption(
            box,
            this.prefix + ", " + this.depth + ", " + this.idx,
            caption_point,
            caption_point
        );

        return box;
    }

    as_list(): FlattenNode[] {
        let nodes: FlattenNode[] = [this];
        this.children.forEach((child) => {
            nodes.push(...child.as_list());
        });
        return nodes;
    }

    to_continuous_points(points: Point2D[]): Point2D[] {
        points.push(...this.upper_nodes);

        this.children.forEach((child) => {
            child.to_continuous_points(points);
        });

        points.push(...this.lower_nodes.reverse());

        return points;
    }

    get_bounded_interval(segment: HullSegment): Interval {
        const start = this.lower_bound(segment.dist);
        const end = this.upper_bound(segment.dist);
        return {
            start,
            end,
        }
    }

    append_segment(
        points: Point2D[],
        f1f4_dir: number,
        fnfn_less1_dir: number,
        seg_idx: number,
        bulkheads: Set<number>
    ) {
        if (this.draw_up) {
            this.upper_nodes.push(points[points.length - 1]);
            this.lower_nodes.push(points[0]);
            this.draw_up_ref_dir = f1f4_dir;
            this.draw_down_ref_dir = fnfn_less1_dir;
        } else {
            this.upper_nodes.push(points[0]);
            this.lower_nodes.push(points[points.length - 1]);
            this.draw_up_ref_dir = fnfn_less1_dir;
            this.draw_down_ref_dir = f1f4_dir;
        }

        if (bulkheads.has(seg_idx)) {
            this.bulkheads.push(points);
        }
    }

    // Split the nodes recursively, consuming the nodes along the way to prevent
    //  re-consuming nodes
    try_split_recursive(
        segments: HullSegment[],
        curves: HullCurve[],
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulk_head_segs: Set<number>
    ) {
        // If we've reached the end, then fill ourselves and return
        if (curves.length == 0) {
            this.fill(
                segments,
                0,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                bulk_head_segs
            );
            return;
        }

        // Otherwise, try and consume our curves, unshifting along the way
        const curves_copy = [...curves];
        let hull_curve;
        let consumed = false;
        while (!consumed && (hull_curve = curves_copy.shift()) != undefined) {
            consumed = this.try_split(
                segments,
                hull_curve,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                bulk_head_segs
            ).consumed;
        }

        // If we couldn't find anything to consume, we're at the end and can fill
        //  ourselves
        if (!consumed) {
            this.fill(
                segments,
                0,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                bulk_head_segs
            );
            return;
        }

        // Otherwise Fill our children recursively
        this.children.forEach((child) =>
            child.try_split_recursive(
                segments,
                curves_copy,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                bulk_head_segs
            )
        );
    }

    // Try to split the node with a given HullCurve. Either return an arry
    //  containing [this] or [upper_child, lower_child]
    try_split(
        segments: HullSegment[],
        curve: HullCurve,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulk_head_segs: Set<number>
    ): {
        consumed: boolean;
        nodes: FlattenNode[];
    } {
        // Find our t values at the curve's endpoint
        const curve_end_p = curve.curve.get(1);
        const this_end_t_upper = this.upper_bound(curve_end_p.x);
        const this_end_t_lower = this.lower_bound(curve_end_p.x);

        // If it's outside our bounds, we can't create children
        if (
            curve_end_p.y > this_end_t_upper ||
            curve_end_p.y < this_end_t_lower
        ) {
            return {
                consumed: false,
                nodes: [this],
            };
        }

        // Otherwise, we've reached the end of our node! We can fill it
        const new_dirs = this.fill(
            segments,
            curve.end_seg_idx,
            puzzle_tooth_width,
            puzzle_tooth_angle,
            bulk_head_segs
        );

        // Once filled we can begin creating our new nodes. First we need to
        //  define the boundary between them
        const curve_bound = (dist: number) =>
            curve.curve.find_dimm_dist(0, dist).p.y;

        const child_draw_down = new FlattenNode(
            this.prefix,
            this.depth + 1,
            this.children.length,
            curve.end_seg_idx,
            false,
            this.upper_nodes[this.upper_nodes.length - 1],
            new_dirs.draw_up_ref_dir,
            new_dirs.draw_down_ref_dir,
            this.upper_bound,
            curve_bound
        );
        this.children.push(child_draw_down);

        const child_draw_up = new FlattenNode(
            this.prefix,
            this.depth + 1,
            this.children.length,
            curve.end_seg_idx,
            true,
            this.lower_nodes[this.lower_nodes.length - 1],
            new_dirs.draw_up_ref_dir,
            new_dirs.draw_down_ref_dir,
            curve_bound,
            this.lower_bound
        );
        this.children.push(child_draw_up);

        return {
            consumed: true,
            nodes: [child_draw_down, child_draw_up],
        };
    }

    fill(
        segments: HullSegment[],
        idx_end: number,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: Set<number>
    ): FillResult {
        console.log("\n==== FILLING NODE ====");
        console.log(
            "\nStart Segment            : ",
            this.start_seg_idx,
            "\nStart Segment Distance   : ",
            segments[this.start_seg_idx].dist,
            "\nEnd Segment              : ",
            idx_end,
            "\nEnd Segment Distance     : ",
            segments[idx_end].dist,
            "\nT Upper Start            : ",
            this.upper_bound(segments[this.start_seg_idx].dist),
            "\nT Lower Start            : ",
            this.lower_bound(segments[this.start_seg_idx].dist)
        );

        let bounds_b = this.get_bounded_interval(segments[this.start_seg_idx]);
        let bounds_a = this.get_bounded_interval(segments[this.start_seg_idx - 1]);

        let flattened = unroll_point_set(
            segments[this.start_seg_idx - 1].hull_curve,
            bounds_a,
            segments[this.start_seg_idx].hull_curve,
            bounds_b,
            !this.draw_up,
            this.reference_point,
            this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
            !this.draw_up
        );

        this.start = point_path_to_puzzle_teeth(
            flattened.b_flat,
            puzzle_tooth_width,
            puzzle_tooth_angle
        );

        this.append_segment(
            flattened.b_flat,
            flattened.f1f4_dir,
            flattened.fnfn_less1_dir,
            this.start_seg_idx,
            bulkheads
        );
        this.append_segment(
            flattened.a_flat,
            flattened.f1f4_dir,
            flattened.fnfn_less1_dir,
            this.start_seg_idx - 1,
            bulkheads
        );

        bounds_b = bounds_a;

        for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
            bounds_a = this.get_bounded_interval(segments[i]);

            flattened = unroll_point_set(
                segments[i].hull_curve,
                bounds_a,
                segments[i + 1].hull_curve,
                bounds_b,
                !this.draw_up,
                flattened.a_flat[0],
                this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
                !this.draw_up
            );

            this.append_segment(
                flattened.a_flat,
                flattened.f1f4_dir,
                flattened.fnfn_less1_dir,
                i,
                bulkheads
            );

            bounds_b = bounds_a;
        }

        return {
            draw_up_ref_dir: this.draw_up_ref_dir,
            draw_down_ref_dir: this.draw_down_ref_dir,
        };
    }
}

interface FillResult {
    draw_up_ref_dir: number;
    draw_down_ref_dir: number;
}
