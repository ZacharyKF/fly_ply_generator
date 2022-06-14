import { RationalBezierSurface } from "../curves/rational_bezier_surface";
import { Point2D } from "../euclidean/rational_point";
import { BoundFn, FillingNode, FillResult, MeshNode } from "./mesh_node";

export class TriangleNode extends MeshNode {
    readonly tri_counts: number[];
    triangle: FillingNode[] = [];

    constructor(
        divisions: number,
        reference_point_top: Point2D,
        upper_bound: BoundFn,
        lower_bound: BoundFn,
        u_start: number,
        private reference_angle: number
    ) {
        super(
            divisions,
            reference_point_top,
            upper_bound,
            lower_bound,
            u_start
        );

        this.tri_counts = new Array(this.levels_p);
        this.tri_counts[0] = 0;
        for (let c = 1; c <= this.levels; c++) {
            this.tri_counts[c] = this.tri_counts[c - 1] + c;
        }
    }

    protected get_node(idx: number): FillingNode {
        return this.triangle[idx];
    }

    protected get_opposing_ids(
        div: number,
        i: number,
        j: number
    ): { a: number; b: number } {
        if (i == j) {
            // If the row and column match, we're along the diagnol of the 
            //  triangle
            return {
                a: this.get_idx(div, i + 1, j + 1),
                b: this.get_idx(div, i - 1, j - 1),
            };
        }

        return super.get_opposing_ids(div, i, j);
    }

    get_idx(div: number, i: number, j: number): number {
        const step = this.steps[div];
        const c = i * step;
        const r = j * step;
        return this.tri_counts[c] + r;
    }

    get_i_j_rel(
        div: number,
        i: number,
        j: number
    ): { i_rel: number; j_rel: number } {
        const step = this.steps[div];
        const step_max = this.steps[0];
        const j_rel = i / j;
        const i_rel = (i * step) / step_max;
        return { i_rel, j_rel };
    }

    protected fill_initial(surface: RationalBezierSurface): FillResult {
        this.triangle = new Array(
            this.tri_counts[this.tri_counts.length - 1] + this.levels
        );

        return {};
    }
}
