import { IModel, IModelMap, model } from "makerjs";
import { pi } from "mathjs";
import { points_to_imodel, point_path_to_puzzle_teeth } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { HullSegment } from "./rational_bezier_hull";
import { middle_value, unroll_point_set } from "./rational_math";
import { Point2D, Point3D } from "./rational_point";

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

    bound_segment_with_flatten_node(segment: HullSegment): RationalBezier {
        let upper_bound = this.upper_bound(segment.dist);
        let lower_bound = this.lower_bound(segment.dist);
        return segment.hull_curve.split_segment(lower_bound, upper_bound);
    }

    append_segment(points: Point2D[], seg_idx: number, bulkheads: Set<number>) {
        this.upper_nodes.push(points[!this.draw_up ? points.length - 1 : 0]);
        this.lower_nodes.push(points[!this.draw_up ? 0 : points.length - 1]);

        if (bulkheads.has(seg_idx)) {
            this.bulkheads.push(points);
        }
    }

    fill(
        segments: HullSegment[],
        idx_end: number,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: Set<number>
    ): FillResult {
        console.log("\n==== FILLING NODE ====")
        console.log(
            "\nStart Segment            : ", this.start_seg_idx,
            "\nStart Segment Distance   : ", segments[this.start_seg_idx].dist,
            "\nEnd Segment              : ", idx_end,
            "\nEnd Segment Distance     : ", segments[idx_end].dist,
            "\nT Upper Start            : ", this.upper_bound(segments[this.start_seg_idx].dist),
            "\nT Lower Start            : ", this.lower_bound(segments[this.start_seg_idx].dist),            
        );

        let bezier_b = this.bound_segment_with_flatten_node(
            segments[this.start_seg_idx]
        );
        let bezier_a = this.bound_segment_with_flatten_node(
            segments[this.start_seg_idx - 1]
        );

        let flattened = unroll_point_set(
            bezier_a,
            bezier_b,
            this.draw_up,
            this.reference_point,
            this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
            this.draw_up
        );

        this.start = point_path_to_puzzle_teeth(
            flattened.b_flat,
            puzzle_tooth_width,
            puzzle_tooth_angle
        );

        this.append_segment(flattened.b_flat, this.start_seg_idx, bulkheads);
        this.append_segment(
            flattened.a_flat,
            this.start_seg_idx - 1,
            bulkheads
        );

        bezier_b = bezier_a;

        for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
            bezier_a = this.bound_segment_with_flatten_node(segments[i]);

            this.draw_up_ref_dir = this.draw_up
                ? flattened.f1f4_dir
                : flattened.fnfn_less1_dir;
            this.draw_down_ref_dir = this.draw_up
                ? flattened.fnfn_less1_dir
                : flattened.f1f4_dir;

            flattened = unroll_point_set(
                bezier_a,
                bezier_b,
                this.draw_up,
                flattened.a_flat[0],
                this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
                this.draw_up
            );

            this.append_segment(flattened.a_flat, i, bulkheads);

            bezier_b = bezier_a;
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
