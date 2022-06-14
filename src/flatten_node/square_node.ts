import { pi } from "mathjs";
import { RationalBezierSurface } from "../curves/rational_bezier_surface";
import { Point2D } from "../euclidean/rational_point";
import { get_flat_third } from "../utils/rational_math";
import { BoundFn, FillingNode, MeshNode } from "./mesh_node";

export class SquareNode extends MeshNode {
    square: FillingNode[] = [];

    constructor(
        divisions: number,
        reference_point_top: Point2D,
        upper_bound: BoundFn,
        lower_bound: BoundFn,
        u_start: number,
        private reference_point_bottom: Point2D
    ) {
        super(
            divisions,
            reference_point_top,
            upper_bound,
            lower_bound,
            u_start
        );
    }

    protected get_node(idx: number): FillingNode {
        return this.square[idx];
    }

    protected set_node(idx: number, node: FillingNode): void {
        this.square[idx] = node;
    }

    get_idx(div: number, i: number, j: number): number {
        const step = this.steps[div];
        const c = i * step;
        const r = j * step;
        return r * this.levels_p + c;
    }

    get_i_j_rel(
        div: number,
        i: number,
        j: number
    ): { i_rel: number; j_rel: number } {
        // Converting to relative coordinates
        const step_max = this.steps[0];
        const step = this.steps[div];
        const i_rel = (i * step) / step_max;
        const j_rel = (j * step) / step_max;
        return { i_rel, j_rel };
    }

    protected fornodes(
        div: number,
        skip_parent: boolean,
        f: (i: number, j: number) => void
    ): void {
        const n = 2 ** div;
        // Loop over the square at our resolution
        for (let i = 0; i <= n; i++) {
            for (let j = 0; j <= n; j++) {
                // If there would be a collision with the parent, then skip
                //  filling a node
                if (skip_parent && i % 2 == 0 && j % 2 == 0) {
                    continue;
                }
                f(i, j);
            }
        }
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
        const end_j = j == max_l ? j : j + 1;

        for (let c = start_i; c <= end_i; c++) {
            for (let r = start_j; r <= end_j; r++) {
                if (c == i && r == j) {
                    continue;
                }
                f(this.get_idx(div, c, r));
            }
        }
    }

    protected adjust_fixed(div: number, n: number): void {
        this.fixed_idx_a = this.get_idx(div, n, n);
        this.fixed_idx_b = this.get_idx(div, n, n - 1);

        const a = this.square[this.fixed_idx_a];
        const b = this.square[this.fixed_idx_b];
        const dist = a.true_point.dist(b.true_point);
        b.false_point = a.false_point.flat_rotation(0, dist, 3 * pi /2);
    }

    protected fill_initial(surface: RationalBezierSurface) {
        // The array of nodes we'll be filling
        this.square = new Array(this.levels_p * this.levels_p);

        // The fixed corner indexes
        this.fixed_idx_a = this.get_idx(0, 1, 1);
        this.fixed_idx_b = this.get_idx(0, 1, 0);

        // Filling the fixed nodes
        const ut_high = this.get_ut(0, 1, 1);
        const p_fixed_top = surface.get_point_on_surface(ut_high.u, ut_high.t);
        this.square[this.fixed_idx_a] = {
            true_point: p_fixed_top,
            false_point: this.reference_point_top,
            nudge: this.reference_point_top,
        };

        const ut_low = this.get_ut(0, 1, 0);
        const p_fixed_bot = surface.get_point_on_surface(ut_low.u, ut_low.t);
        this.square[this.fixed_idx_b] = {
            true_point: p_fixed_bot,
            false_point: this.reference_point_bottom,
            nudge: this.reference_point_bottom,
        };

        const idx_unfixed_top = this.get_idx(0, 0, 1);
        const ut_unfixed_top = this.get_ut(0, 0, 1);
        const p_unfixed_top = surface.get_point_on_surface(
            ut_unfixed_top.u,
            ut_unfixed_top.t
        );
        const unfixed_false_top = get_flat_third(
            this.square[this.fixed_idx_a].false_point,
            p_fixed_top.dist(p_unfixed_top),
            this.square[this.fixed_idx_b].false_point,
            p_fixed_bot.dist(p_unfixed_top),
            Point2D.X.mul(-1)
        );
        this.square[idx_unfixed_top] = {
            true_point: p_unfixed_top,
            false_point: unfixed_false_top,
            nudge: unfixed_false_top,
        };

        const idx_unfixed_bot = this.get_idx(0, 0, 0);
        const ut_unfixed_bot = this.get_ut(0, 0, 0);
        const p_unfixed_bot = surface.get_point_on_surface(
            ut_unfixed_bot.u,
            ut_unfixed_bot.t
        );
        const unfixed_false_bot = get_flat_third(
            this.square[this.fixed_idx_b].false_point,
            p_fixed_bot.dist(p_unfixed_bot),
            this.square[this.fixed_idx_a].false_point,
            p_fixed_top.dist(p_unfixed_bot),
            Point2D.X.mul(-1)
        );
        this.square[idx_unfixed_bot] = {
            true_point: p_unfixed_bot,
            false_point: unfixed_false_bot,
            nudge: unfixed_false_bot,
        };
    }
}
