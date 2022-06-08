import { max, min } from "mathjs";
import { SurfaceCurve } from "../curves/rational_bezier_surface";
import { RationalInterval } from "../curves/rational_interval";
import { Point2D, Point3D } from "../euclidean/rational_point";
import { point_path_to_puzzle_teeth } from "../utils/makerjs_tools";
import {
    interpolate_line,
    unroll_beziers,
} from "../utils/rational_math";
import { FillResult } from "./draw_nodes";
import { FlattenNode } from "./flatten_node";

export class UpperNode extends FlattenNode {
    constructor(
        n_bulkheads: number,
        prefix: string,
        depth: number,
        idx: number,
        start_seg_idx: number,
        fill_last: FillResult,
        upper_bound: (dist: number) => number,
        lower_bound: (dist: number) => number
    ) {
        super(
            n_bulkheads,
            prefix,
            depth,
            idx,
            start_seg_idx,
            fill_last.ref_point_upper,
            fill_last.draw_down_ref_dir,
            fill_last.ref_dir_lower,
            upper_bound,
            lower_bound
        );
    }

    get_bounded_interval(u: number): RationalInterval {
        const end = this.lower_bound(u);
        const start = this.upper_bound(u);
        return {
            start,
            end,
        };
    }

    get_start(): Point2D[] {
        return [...this.start];
    }

    append_segment(
        points: Point2D[],
        curve: SurfaceCurve,
        bounds: RationalInterval
    ) {
        this.upper_nodes.push(points[0]);
        this.lower_nodes.push(points[points.length - 1]);

        const b_max = max(bounds.start, bounds.end);
        const b_min = min(bounds.start, bounds.end);
        const bounds_diff = b_max - b_min;
        curve.intersections.forEach((intersects, idx) => {
            // Make sure that intersections actually exist
            if (intersects.length > 0) {
                const bulkhead = this.bulkheads[idx];
                intersects.forEach((t) => {
                    // If they do, we also need to ensure that they are between the
                    //  bounds
                    if (t >= b_min && t <= b_max) {
                        // Once we know they are, we can relavitize the t and
                        //  interpolate the flat line
                        const t_rel = (t - b_min) / bounds_diff;
                        const t_actual = 1 - t_rel;
                        bulkhead.push(interpolate_line(points, t_actual));
                    }
                });
            }
        });
    }

    fill(
        surface_curves: SurfaceCurve[],
        idx_end: number,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number
    ): FillResult {
        let b = this.get_curve_data(surface_curves[this.start_seg_idx]);
        let a = this.get_curve_data(surface_curves[this.start_seg_idx - 1]);

        let flattened = unroll_beziers(
            a.c.c,
            a.b,
            b.c.c,
            b.b,
            this.reference_point,
            this.reference_angle,
            this.reference_direction,
            false
        );

        if (this.depth > 0) {
            this.start = point_path_to_puzzle_teeth(
                flattened.b_flat,
                puzzle_tooth_width,
                puzzle_tooth_angle
            );
        }

        this.append_segment(flattened.b_flat, b.c, b.b);
        this.append_segment(flattened.a_flat, a.c, a.b);

        b = a;

        for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
            a = this.get_curve_data(surface_curves[i]);

            flattened = unroll_beziers(
                a.c.c,
                a.b,
                b.c.c,
                b.b,
                flattened.a_flat[0],
                flattened.f1f4_dir,
                this.reference_direction,
                false,
            );

            this.append_segment(flattened.a_flat, a.c, a.b);

            b = a;
        }

        return {
            draw_up_ref_dir: flattened.fnfn_less1_dir,
            draw_down_ref_dir: flattened.f1f4_dir,
            ref_point_upper: flattened.a_flat[0],
            ref_point_lower: flattened.a_flat[flattened.a_flat.length - 1],
            ref_dir_upper: flattened.a_flat[0].sub(flattened.b_flat[0]),
            ref_dir_lower: flattened.a_flat[flattened.a_flat.length - 1].sub(
                flattened.b_flat[flattened.b_flat.length - 1]
            ),
        };
    }
}
