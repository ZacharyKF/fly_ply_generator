import { min, pi } from "mathjs";
import { RationalBezierSurface } from "../curves/rational_bezier_surface";
import { Point2D } from "../euclidean/rational_point";
import { get_flat_third } from "../utils/rational_math";
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
        private reference_angle_fixed: number,
        private reference_dir_third: Point2D
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

    get_node(idx: number): FillingNode {
        return this.triangle[idx];
    }

    protected set_node(idx: number, node: FillingNode): void {
        this.triangle[idx] = node;
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
        if (i == 0) {
            return {
                i_rel: 1.0,
                j_rel: 0,
            };
        }

        const step = this.steps[div];
        const step_max = this.steps[0];
        const j_rel = j / i;
        const i_rel = 1 - (i * step) / step_max;
        return { i_rel, j_rel };
    }

    protected fornodes(
        div: number,
        skip_parent: boolean,
        f: (i: number, j: number) => void
    ): void {
        const n = 2 ** div;
        // Loop over the triangle at our resolution
        for (let i = 0; i <= n; i++) {
            // For the triangle we only go to the diagnol
            for (let j = 0; j <= i; j++) {
                // Parents are skipped in the same way as the square
                if (skip_parent && i % 2 == 0 && j % 2 == 0) {
                    continue;
                }
                f(i, j);
            }
        }
    }

    get_all(): Point2D[] {
        return this.triangle.map((n) => n.false_point);
    }

    protected forneighbors(
        div: number,
        i: number,
        j: number,
        f: (idx: number) => void
    ): void {
        const max_l = 2 ** div;
        const start_i = i == 0 ? i : i - 1;
        const end_i = i == max_l ? i : i + 1;

        const start_j = j == 0 ? j : j - 1;

        for (let c = start_i; c <= end_i; c++) {
            const end_j = min(j + 1, c);
            for (let r = start_j; r <= end_j; r++) {
                if (c == i && r == j) {
                    continue;
                }
                f(this.get_idx(div, c, r));
            }
        }
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

    protected adjust_fixed(div: number, n: number): void {
        this.fixed_idx_a = this.get_idx(div, 0, 0);
        this.fixed_idx_b = this.get_idx(div, 1, 0);

        const a = this.triangle[this.fixed_idx_a];
        const b = this.triangle[this.fixed_idx_b];
        const dist = a.true_point.dist(b.true_point);
        a.false_point = this.reference_point_top;
        b.false_point = a.false_point.flat_rotation(
            0,
            dist,
            this.reference_angle_fixed
        );
    }

    protected fill_initial(surface: RationalBezierSurface) {
        // The array of nodes we'll be filling
        this.triangle = new Array(
            this.tri_counts[this.tri_counts.length - 1] + this.levels
        );

        // The first fixed indexes
        this.fixed_idx_a = this.get_idx(0, 0, 0);
        const ut_a = this.get_ut(0, 0, 0);
        const p_a = surface.get_point_on_surface(ut_a.u, ut_a.t);
        const f_a = this.reference_point_top;

        this.fixed_idx_b = this.get_idx(0, 1, 0);
        const ut_b = this.get_ut(0, 1, 0);
        const p_b = surface.get_point_on_surface(ut_b.u, ut_b.t);
        const d_ab = p_a.dist(p_b);
        const f_b = f_a.flat_rotation(0, d_ab, this.reference_angle_fixed);

        const fixed_idx_c = this.get_idx(0, 1, 1);
        const ut_c = this.get_ut(0, 1, 1);
        const p_c = surface.get_point_on_surface(ut_c.u, ut_c.t);
        const d_ac = p_a.dist(p_c);
        const d_bc = p_b.dist(p_c);
        const f_c = get_flat_third(
            f_b,
            d_bc,
            f_a,
            d_ac,
            this.reference_dir_third
        );

        this.triangle[this.fixed_idx_a] = {
            true_point: p_a,
            false_point: f_a,
            nudge: f_a,
        };

        this.triangle[this.fixed_idx_b] = {
            true_point: p_b,
            false_point: f_b,
            nudge: f_b,
        };

        this.triangle[fixed_idx_c] = {
            true_point: p_c,
            false_point: f_c,
            nudge: f_c,
        };
    }
}
