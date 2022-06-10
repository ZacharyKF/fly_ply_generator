import { IPath } from "makerjs";
import { RationalArc } from "../euclidean/rational_arc";
import { RationalBezier } from "./rational_bezier";
import { RationalLine } from "../euclidean/rational_line";
import { circle_center } from "../utils/rational_math";
import { RationalPath } from "../euclidean/rational_path";
import { Point } from "../euclidean/rational_point";

const N_CHECKS = 100;
export class RationalSegment<P extends Point> {
    readonly segment: RationalPath<P>;
    readonly error: number;

    constructor(
        parent: RationalBezier<P>,
        readonly start_p: P,
        readonly start_t: number,
        readonly end_p: P,
        readonly end_t: number
    ) {
        // Do a quarternary search for the best fit of a path to our segment

        let high = end_t;
        let low = start_t;
        let mid_2 = (high + low) / 2;
        let step = 0;
        let mid_1 = 0;
        let mid_3 = 0;

        let best_path = this.make_path(parent, mid_2);
        let best_error = this.calc_error(parent, best_path);

        while (step > 0) {
            step = (high - low) / 4;

            if (step == 0) {
                break;
            }

            mid_1 = mid_2 - step;
            mid_3 = mid_2 + step;

            let path_1 = this.make_path(parent, mid_1);
            let error_1 = this.calc_error(parent, path_1);

            let path_3 = this.make_path(parent, mid_3);
            let error_3 = this.calc_error(parent, path_3);

            if (error_1 < best_error && error_1 < error_3) {
                // If error_1 is lowest, re center around mid_1
                // low = low
                mid_2 = mid_1;
                high = mid_2;

                best_path = path_1;
                best_error = error_1;
            } else if (error_3 < best_error) {
                // If error_2 is lowest, re center around mid_3
                low = mid_2;
                mid_2 = mid_3;
                // high = high

                best_path = path_3;
                best_error = error_3;
            } else {
                // Otherwise no re-assignment is needed, but our scope shrinks
                low = mid_1;
                // mid_2 = mid_2
                high = mid_3;
            }
        }

        this.segment = best_path;
        this.error = best_error;
    }

    private make_path(parent: RationalBezier<P>, mid: number): RationalPath<P> {
        const mid_p = parent.get(mid);
        const center = circle_center(this.start_p, mid_p, this.end_p);

        if (center == undefined) {
            return new RationalLine<P>(this.start_p, this.end_p);
        } else {
            return new RationalArc<P>(
                center,
                this.start_p,
                mid_p,
                this.end_p,
                center.dist(mid_p)
            );
        }
    }

    private calc_error(
        parent: RationalBezier<P>,
        path: RationalPath<P>
    ): number {
        let total_error = 0;
        let p_last = this.start_p;
        for (let i = 1; i < N_CHECKS; i++) {
            const idx = i / N_CHECKS;
            const t = this.start_t * idx + this.end_t * (1 - idx);
            const p = parent.get(t);
            const seg_dist = path.dist_to_point(p);
            const p_dist = p.dist(p_last);
            total_error += seg_dist * p_dist;
            p_last = p;
        }
        return total_error;
    }

    draw(dimension: number): IPath {
        return this.segment.as_path(dimension);
    }
}
