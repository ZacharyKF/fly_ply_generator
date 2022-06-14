import { RationalBezierSurface } from "../curves/rational_bezier_surface";
import { Point2D, Point3D } from "../euclidean/rational_point";

export type BoundFn = (dist: number) => number;

export interface FillResult {}

export interface FillingNode {
    true_point: Point3D;
    false_point: Point2D;
    nudge: Point2D;
}

export abstract class MeshNode {
    // Empty from start
    children: MeshNode[] = [];
    start: Point2D[] = [];
    upper_nodes: Point2D[] = [];
    lower_nodes: Point2D[] = [];
    bulkheads: Point2D[][] = [];

    // Derived
    readonly levels: number;
    readonly levels_p: number;
    readonly steps: number[];
    fixed_idx_a: number = 0;
    fixed_idx_b: number = 1;

    // Set later
    protected u_end: number = 0;

    constructor(
        readonly divisions: number,
        readonly reference_point_top: Point2D,
        readonly upper_bound: BoundFn,
        readonly lower_bound: BoundFn,
        readonly u_start: number
    ) {
        this.steps = new Array(divisions + 1);
        for (let i = 0; i <= divisions; i++) {
            this.steps[i] = 2 ** (divisions - i);
        }
        this.levels = this.steps[0];
        this.levels_p = this.levels + 1;
    }

    fill(surface: RationalBezierSurface, u_end: number): FillResult {
        this.u_end = u_end;
        this.fill_initial(surface);

        // We'll loop from our least accurate resolution to our most, skipping
        //  the first, pre-populated level
        for (let div = 1; div <= this.divisions; div++) {
            this.fornodes(div, true, (i, j) => {
                const false_point = this.divide_opposing_neighbors(div, i, j);
                const ut = this.get_ut(div, i, j);
                const true_point = surface.get_point_on_surface(ut.u, ut.t);
                const idx = this.get_idx(div, i, j);
                this.set_node(idx, {
                    false_point,
                    true_point,
                    nudge: false_point,
                });
            });

            // Start with the corners then subdivide from there
            const n = 2 ** div;

            this.adjust_fixed(div, n);

            // Once the level is populated we want to "nudge" all of the points
            //  based on their proximity to their neighbors. nudging too many
            //  times on higher levels isn't particularly useful
            for (let t = 0; t <= (2 * n); t++) {
                this.fornodes(div, false, (i, j) => {
                    // Get the idx we're about to nudge
                    const nudge_idx = this.get_idx(div, i, j);

                    // Skip the fixed points
                    if (
                        nudge_idx != this.fixed_idx_a &&
                        nudge_idx != this.fixed_idx_b
                    ) {
                        const p_move = this.get_node(nudge_idx);
                        p_move.nudge = p_move.false_point;
                        this.forneighbors(div, i, j, (idx) => {
                            const p_other = this.get_node(idx);
                            this.nudge_relative(div, p_move, p_other);
                        });
                    }
                });

                this.fornodes(div, false, (i, j) => {
                    // Get the idx we're about to nudge
                    const nudge_idx = this.get_idx(div, i, j);

                    // Skip the fixed points
                    if (
                        nudge_idx != this.fixed_idx_a &&
                        nudge_idx != this.fixed_idx_b
                    ) {
                        const node = this.get_node(nudge_idx);
                        node.false_point = node.nudge;
                    }
                });
            }
        }

        return {};
    }

    nudge_relative(div: number, p_move: FillingNode, p_other: FillingNode) {
        const vec_2d = p_move.false_point.sub(p_other.false_point);
        const dist_2d = p_move.false_point.dist(p_other.false_point);
        const dist_3d = p_move.true_point.dist(p_other.true_point);

        // The 10 here prevents nodes from crossing over, keeping the mesh
        //  somewhat stable
        const dist_rel = (dist_3d - dist_2d) / (dist_3d * (div + 1));
        p_move.nudge = p_move.nudge.add(vec_2d.mul(dist_rel));
    }

    get_ut(div: number, i: number, j: number): { u: number; t: number } {
        const { i_rel, j_rel } = this.get_i_j_rel(div, i, j);

        // Getting our upper/lower bounds at the point
        const u = this.u_start * (1 - i_rel) + this.u_end * i_rel;
        const b_up = this.upper_bound(u);
        const b_down = this.lower_bound(u);
        const t = b_down * (1 - j_rel) + b_up * j_rel;

        return { u, t };
    }

    divide_opposing_neighbors(div: number, i: number, j: number): Point2D {
        const { a, b } = this.get_opposing_ids(div, i, j);
        const pa = this.get_node(a);
        const pb = this.get_node(b);
        return new Point2D(
            (pa.false_point.x + pb.false_point.x) / 2,
            (pa.false_point.y + pb.false_point.y) / 2,
            1
        );
    }

    protected get_opposing_ids(
        div: number,
        i: number,
        j: number
    ): { a: number; b: number } {
        // Default Square opposing ID methods these are used for other shapes as
        //  well
        if (i % 2 == 0) {
            // If i lines up with the parent, then we can use the vertical
            //  neighbors
            return {
                a: this.get_idx(div, i, j + 1),
                b: this.get_idx(div, i, j - 1),
            };
        } else if (j % 2 == 0) {
            // If j lines up with the parent, then we can use the horizontal
            //  neighbors
            return {
                a: this.get_idx(div, i + 1, j),
                b: this.get_idx(div, i - 1, j),
            };
        } else {
            // Otherwise we'll need to use the diagnol neighbors
            return {
                a: this.get_idx(div, i + 1, j + 1),
                b: this.get_idx(div, i - 1, j - 1),
            };
        }
    }

    protected abstract adjust_fixed(div: number, n: number): void;
    protected abstract forneighbors(
        div: number,
        i: number,
        j: number,
        f: (idx: number) => void
    ): void;
    protected abstract fornodes(
        div: number,
        skip_parent: boolean,
        f: (i: number, j: number) => void
    ): void;
    protected abstract get_node(idx: number): FillingNode;
    protected abstract set_node(idx: number, node: FillingNode): void;
    protected abstract get_i_j_rel(
        div: number,
        i: number,
        j: number
    ): { i_rel: number; j_rel: number };
    protected abstract fill_initial(surface: RationalBezierSurface): void;
    protected abstract get_idx(div: number, i: number, j: number): number;
}
