import { IModel, models } from "makerjs";
import { floor, sqrt } from "mathjs";
import { Point } from "../euclidean/rational_point";
import { binomial } from "../utils/rational_math";
import { NormalizedCurve } from "./normalized_curve";
import { RationalSegment } from "./rational_segment";

export class RationalBezier<P extends Point> extends NormalizedCurve<P> {
    controls: P[];
    segments: RationalSegment<P>[];

    constructor(controls: P[]) {
        super(<P>controls[0].zero());
        this.controls = controls;
        this.segments = [];
        this.populate_lut();
    }

    // Use the bernstein polynomial method to find the point
    get_internal(t: number): P {
        if (t <= 0) {
            return this.controls[0];
        } else if (t >= 1) {
            return this.controls[this.controls.length - 1];
        }
        let n = this.controls.length - 1;
        let s = 1 - t;

        let init_point = <P>this.controls[0].zero();
        let denominator = 0;

        for (let i = 0; i < this.controls.length; i++) {
            let control = this.controls[i];
            let multiplier = control.w * s ** (n - i) * t ** i * binomial(n, i);
            denominator += multiplier;
            init_point = <P>init_point.add(control.mul(multiplier));
        }

        return <P>init_point.div(denominator);
    }

    // Just use every 10th point from the LUT
    draw(dimension: number): IModel {
        let points = this.as_list().map((p) => p.to_ipoint(dimension));
        points.push(this.lut[this.lut.length - 1].p.to_ipoint(dimension));
        return new models.ConnectTheDots(false, points);
    }

    find_segments(
        variance_tolerance: number,
        min_segments: number,
        max_segments: number
    ): RationalSegment<P>[] {
        if (this.segments.length > 0) {
            return this.segments;
        }

        let min_id = 1;
        let max_id = this.lut.length - 2;
        let num_segs = min_segments;

        // We'll build our segments from these eventually
        let divisors: number[];
        let total_error = 0;
        let segments: RationalSegment<P>[] = [];

        do {
            // Initializing the divisors
            divisors = [];
            divisors.push(min_id);
            let seg_step = floor((max_id - min_id) / num_segs);
            for (let i = 1; i < num_segs; i++) {
                divisors.push(min_id + i * seg_step);
            }
            divisors.push(max_id);

            // Now we need to iterate our k-mean until we settle
            let changed = false;
            do {
                changed = false;

                // Loop across our divisors, checking only the middle ones
                for (let i = 1; i < divisors.length - 1; i++) {
                    let low = divisors[i - 1] - 1;
                    let mid = divisors[i];
                    let high = divisors[i + 1];

                    let left_center = this.calc_center(mid, low);
                    let right_center = this.calc_center(high, mid);

                    let dist_curr_left = this.calc_dist(mid, left_center);
                    let dist_curr_right = this.calc_dist(mid, right_center);

                    if (dist_curr_right < dist_curr_left) {
                        divisors[i]--;
                        changed = true;
                        continue;
                    }

                    let dist_next_left = this.calc_dist(mid + 1, left_center);
                    let dist_next_right = this.calc_dist(mid + 1, right_center);

                    if (dist_next_left < dist_next_right) {
                        divisors[i]++;
                        changed = true;
                        continue;
                    }
                }
            } while (changed);

            divisors[0] = 0;
            divisors[divisors.length - 1] = this.lut.length - 1;

            total_error = 0;
            segments = [];
            for (let i = 0; i < divisors.length - 1; i++) {
                const l_start = this.lut[divisors[i]];
                const l_end = this.lut[divisors[i + 1]];
                const new_seg = new RationalSegment<P>(
                    this,
                    l_start.p,
                    l_start.d / this.length,
                    l_end.p,
                    l_end.d / this.length
                );
                total_error += new_seg.error;
                segments.push(new_seg);
            }
            // Iterate our number of segments so that if we need to go again we
            //  add more segments to decrease the variance
        } while (total_error > variance_tolerance && num_segs++ < max_segments);

        this.segments = segments;
        return segments;
    }

    private calc_center(
        id_b: number,
        id_a: number
    ): {
        x: number;
        y: number;
    } {
        const sum = this.lut[id_b].a - this.lut[id_a].a;
        const n = id_b - id_a;
        return {
            x: (id_b + id_a) / 2,
            y: sum / n,
        };
    }

    private calc_dist(id: number, p: { x: number; y: number }): number {
        const lut = this.lut[id];
        const d_x = id - p.x;
        const d_y = lut.angle - p.y;
        return sqrt(d_x * d_x + (d_y * d_y) / 2);
    }
}
