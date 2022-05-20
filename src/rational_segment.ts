import { IPath } from "makerjs";
import { abs, floor, min } from "mathjs";
import { RationalArc } from "./rational_arc";
import { RationalBezier } from "./rational_bezier";
import { RationalLine } from "./rational_line";
import { circle_center } from "./rational_math";
import { RationalPath } from "./rational_path";
import { Point } from "./rational_point";

export class RationalSegment<P extends Point> {
    readonly parent: RationalBezier<P>;
    readonly start: number;
    readonly start_t: number;
    readonly start_point: P;
    readonly end: number;
    readonly end_t: number;
    readonly end_point: P;
    readonly segment: RationalPath<P>;
    readonly error: number;

    constructor(parent: RationalBezier<P>, start: number, end: number) {
        this.parent = parent;
        this.start = start;
        this.start_t = parent.lut[start].d/parent.length;
        this.start_point = parent.lut[start].p;
        this.end = end;
        this.end_t = parent.lut[end].d/parent.length;
        this.end_point = parent.lut[end].p;

        // Do a quarternary search for the best fit of a path to our segment

        let high = end;
        let low = start;
        let step = floor((high - low) / 4);
        let mid_1 = low + step;
        let mid_2 = low + step * 2;
        let mid_3 = low + step * 3;

        let best_path = this.make_path(mid_2);
        let best_error = this.calc_error(best_path);

        while (step > 0) {
            step = floor((high - low) / 4);

            if (step == 0) {
                break;
            }

            mid_1 = mid_2 - step;
            mid_3 = mid_2 + step;

            let path_1 = this.make_path(mid_1);
            let error_1 = this.calc_error(path_1);

            let path_3 = this.make_path(mid_3);
            let error_3 = this.calc_error(path_3);

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

    private make_path(mid: number): RationalPath<P> {
        const mid_point = this.parent.lut[mid].p;
        const center = circle_center(this.start_point, mid_point, this.end_point);

        if (center == undefined) {
            return new RationalLine<P>(this.start_point, this.end_point);
        } else {
            return new RationalArc<P>(
                center,
                this.start_point,
                mid_point,
                this.end_point,
                center.dist(mid_point)
            );
        }
    }

    private calc_error(path: RationalPath<P>): number {
        let d_total = 0;
        for (let i = this.start + 1; i < this.end - 1; i++) {
            const seg_dist = path.dist_to_point(this.parent.lut[i].p);
            const lut_dist = this.parent.lut[i].d - this.parent.lut[i - 1].d;
            d_total += seg_dist * lut_dist;
        }

        const total_length =
            this.parent.lut[this.end].d - this.parent.lut[this.start].d;
        const l_factor = 1 + abs(path.length - total_length);

        return d_total * l_factor;
    }

    draw(dimension: number): IPath {
        return this.segment.as_path(dimension);
    }
}
