import { max, min } from "mathjs";
import { SurfaceCurve } from "../curves/rational_bezier_surface";
import { RationalInterval } from "../curves/rational_interval";
import { Point2D } from "../euclidean/rational_point";
import { point_path_to_puzzle_teeth } from "../utils/makerjs_tools";
import { interpolate_line, unroll_beziers } from "../utils/rational_math";
import { FillResult } from "./draw_nodes";
import { FlattenNode } from "./flatten_node";

export class LowerNode extends FlattenNode {
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
            fill_last.ref_point_lower,
            fill_last.draw_up_ref_dir,
            fill_last.ref_dir_lower,
            upper_bound,
            lower_bound
        );
    }

    get_start(): Point2D[] {
        return [...this.start].reverse();
    }

    
    get_bounded_interval(u: number): RationalInterval {
        const start = this.lower_bound(u);
        const end = this.upper_bound(u);
        return {
            start,
            end,
        };
    }

    append_segment(
        points: Point2D[],
        curve: SurfaceCurve,
        bounds: RationalInterval
    ) {
        this.upper_nodes.push(points[points.length - 1]);
        this.lower_nodes.push(points[0]);

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
                        const t_actual = t_rel;
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

        let bounds_a = this.get_bounded_interval(
            surface_curves[this.start_seg_idx - 1].u
        );

        let bounds_b = this.get_bounded_interval(
            surface_curves[this.start_seg_idx].u
        );

        let flattened = unroll_beziers(
            surface_curves[this.start_seg_idx - 1].c,
            bounds_a,
            surface_curves[this.start_seg_idx].c,
            bounds_b,
            this.reference_point,
            this.reference_angle,
            this.reference_direction,
        );

        if (this.depth > 0) {
            this.start = point_path_to_puzzle_teeth(
                flattened.b_flat,
                puzzle_tooth_width,
                puzzle_tooth_angle
            );
        }

        this.append_segment(
            flattened.a_flat,
            surface_curves[this.start_seg_idx - 1],
            bounds_a
        );

        this.append_segment(
            flattened.b_flat,
            surface_curves[this.start_seg_idx],
            bounds_b
        );

        bounds_b = bounds_a;

        for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
            bounds_a = this.get_bounded_interval(surface_curves[i].u);

            flattened = unroll_beziers(
                surface_curves[i].c,
                bounds_a,
                surface_curves[i + 1].c,
                bounds_b,
                flattened.a_flat[0],
                this.reference_angle,
                this.reference_direction,
            );

            this.append_segment(
                flattened.a_flat,
                surface_curves[i],
                bounds_a
            );

            bounds_b = bounds_a;
        }

        return {
            draw_up_ref_dir: flattened.f1f4_dir,
            draw_down_ref_dir: flattened.fnfn_less1_dir,
            ref_point_upper: flattened.a_flat[flattened.a_flat.length - 1],
            ref_point_lower: flattened.a_flat[0],
            ref_dir_upper: flattened.a_flat[flattened.a_flat.length - 1].sub(flattened.b_flat[flattened.b_flat.length - 1]),
            ref_dir_lower: flattened.a_flat[0].sub(flattened.b_flat[0]),
        };
    }
}
