import { IModel, IModelMap, model } from "makerjs";
import { SurfaceCurve } from "../curves/rational_bezier_surface";
import { RationalInterval } from "../curves/rational_interval";
import { Point2D, Point3D } from "../euclidean/rational_point";
import { points_to_imodel } from "../utils/makerjs_tools";
import { middle_value } from "../utils/rational_math";
import { FillResult } from "./draw_nodes";

export abstract class FlattenNode {
    children: FlattenNode[] = [];
    start: Point2D[] = [];
    upper_nodes: Point2D[] = [];
    lower_nodes: Point2D[] = [];
    bulkheads: Point2D[][] = [];

    constructor(
        readonly n_bulkheads: number,
        readonly prefix: string,
        readonly depth: number,
        readonly idx: number,
        readonly start_seg_idx: number,
        readonly reference_point: Point2D,
        readonly reference_angle: number,
        readonly reference_direction: Point2D,
        readonly upper_bound: (dist: number) => number,
        readonly lower_bound: (dist: number) => number
    ) {
        for (let i = 0; i < n_bulkheads; i++) {
            this.bulkheads.push([]);
        }
    }

    draw_node(): IModel {
        let to_draw: Point2D[] = [...this.upper_nodes];

        this.children.forEach((child) => {
            to_draw.push(...child.get_start());
        });

        to_draw.push(...[...this.lower_nodes].reverse());

        to_draw.push(...this.get_start());

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

    get_curve_data(curve: SurfaceCurve): {
        c: SurfaceCurve;
        b: RationalInterval;
    } {
        const b = this.get_bounded_interval(curve.u);
        return {
            c: curve,
            b,
        };
    }

    abstract get_bounded_interval(u: number): RationalInterval;

    abstract fill(
        surface_curves: SurfaceCurve[],
        idx_end: number,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number
    ): FillResult;

    abstract get_start(): Point2D[];
}
