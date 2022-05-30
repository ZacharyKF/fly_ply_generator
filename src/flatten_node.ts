import { IModel, IModelMap, model } from "makerjs";
import { max, min } from "mathjs";
import { points_to_imodel, point_path_to_puzzle_teeth } from "./makerjs_tools";
import { DivisionCurve, SurfaceCurve } from "./rational_bezier_surface";
import {
    interpolate_line,
    middle_value,
    unroll_beziers,
} from "./rational_math";
import { Point2D } from "./rational_point";
import { Interval } from "./segmented_hull";

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
        n_bulkheads: number,
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
        for (let i = 0; i < n_bulkheads; i++) {
            this.bulkheads.push([]);
        }
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

        const bulkheads: IModelMap = {};
        this.bulkheads.forEach((bulkhead, idx) => {
            if (bulkhead.length > 0) {
                bulkheads["bulkhead_" + idx] = {
                    layer: "blue",
                    ...points_to_imodel(2, false, bulkhead),
                };
            }
        });

        const box: IModel = {
            ...points_to_imodel(2, false, to_draw),
            models: bulkheads,
        };

        const caption_point = middle_value(this.upper_nodes)
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

    get_bounded_interval(u: number): Interval {
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
        bounds: Interval,
        f1f4_dir: number,
        fnfn_less1_dir: number
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
                        bulkhead.push(
                            interpolate_line(
                                points,
                                this.draw_up ? t_rel : 1 - t_rel
                            )
                        );
                    }
                });
            }
        });
    }

    // Split the nodes recursively, consuming the nodes along the way to prevent
    //  re-consuming nodes
    try_split_recursive(
        surface_curves: SurfaceCurve[],
        curves: DivisionCurve[],
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number
    ) {
        // If we've reached the end, then fill ourselves and return
        if (curves.length == 0) {
            this.fill(
                surface_curves,
                0,
                puzzle_tooth_width,
                puzzle_tooth_angle
            );
            return;
        }

        // Otherwise, try and consume our curves, unshifting along the way
        const curves_copy = [...curves];
        let hull_curve;
        let consumed = false;
        while (!consumed && (hull_curve = curves_copy.shift()) != undefined) {
            consumed = this.try_split(
                surface_curves,
                hull_curve,
                puzzle_tooth_width,
                puzzle_tooth_angle
            ).consumed;
        }

        // If we couldn't find anything to consume, we're at the end and can fill
        //  ourselves
        if (!consumed) {
            this.fill(
                surface_curves,
                0,
                puzzle_tooth_width,
                puzzle_tooth_angle
            );
            return;
        }

        // Otherwise Fill our children recursively
        this.children.forEach((child) =>
            child.try_split_recursive(
                surface_curves,
                curves_copy,
                puzzle_tooth_width,
                puzzle_tooth_angle
            )
        );
    }

    // Try to split the node with a given HullCurve. Either return an arry
    //  containing [this] or [upper_child, lower_child]
    try_split(
        surface_curves: SurfaceCurve[],
        curve: DivisionCurve,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number
    ): {
        consumed: boolean;
        nodes: FlattenNode[];
    } {
        // Find our t values at the curve's endpoint
        const curve_end_p = curve.t_curve.get(1);
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
            surface_curves,
            curve.id_end,
            puzzle_tooth_width,
            puzzle_tooth_angle
        );

        // Once filled we can begin creating our new nodes. First we need to
        //  define the boundary between them
        const curve_bound = (dist: number) =>
            curve.t_curve.get_at_dimm_dist(0, dist).y;

        const child_draw_down = new FlattenNode(
            this.bulkheads.length,
            this.prefix,
            this.depth + 1,
            this.children.length,
            curve.id_end,
            false,
            this.upper_nodes[this.upper_nodes.length - 1],
            new_dirs.draw_up_ref_dir,
            new_dirs.draw_down_ref_dir,
            this.upper_bound,
            curve_bound
        );
        this.children.push(child_draw_down);

        const child_draw_up = new FlattenNode(
            this.bulkheads.length,
            this.prefix,
            this.depth + 1,
            this.children.length,
            curve.id_end,
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
        surface_curves: SurfaceCurve[],
        idx_end: number,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number
    ): FillResult {
        let bounds_b = this.get_bounded_interval(
            surface_curves[this.start_seg_idx].u
        );
        let bounds_a = this.get_bounded_interval(
            surface_curves[this.start_seg_idx - 1].u
        );

        let flattened = unroll_beziers(
            surface_curves[this.start_seg_idx - 1].c,
            bounds_a,
            surface_curves[this.start_seg_idx].c,
            bounds_b,
            !this.draw_up,
            this.reference_point,
            this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
            !this.draw_up
        );

        if (this.depth > 0) {
            this.start = point_path_to_puzzle_teeth(
                flattened.b_flat,
                puzzle_tooth_width,
                puzzle_tooth_angle
            );
        }

        this.append_segment(
            flattened.b_flat,
            surface_curves[this.start_seg_idx],
            bounds_b,
            flattened.f1f4_dir,
            flattened.fnfn_less1_dir
        );
        this.append_segment(
            flattened.a_flat,
            surface_curves[this.start_seg_idx - 1],
            bounds_a,
            flattened.f1f4_dir,
            flattened.fnfn_less1_dir
        );

        bounds_b = bounds_a;

        for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
            bounds_a = this.get_bounded_interval(surface_curves[i].u);

            flattened = unroll_beziers(
                surface_curves[i].c,
                bounds_a,
                surface_curves[i + 1].c,
                bounds_b,
                !this.draw_up,
                flattened.a_flat[0],
                this.draw_up ? this.draw_up_ref_dir : this.draw_down_ref_dir,
                !this.draw_up
            );

            this.append_segment(
                flattened.a_flat,
                surface_curves[i],
                bounds_a,
                flattened.f1f4_dir,
                flattened.fnfn_less1_dir
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
