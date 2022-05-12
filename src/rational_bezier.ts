import { IModel, models } from "makerjs";
import { abs, floor, max, min } from "mathjs";
import { binomial } from "./math";
import { Point } from "./rational_point";
import { RationalSegment } from "./rational_segment";

const t_step = 0.001;

export interface RationalLut {
    p: Point;
    t: number;
    d: number;
    angle: number;
    a: number;
    aa: number;
}

export class RationalBezier {
    controls: Point[];
    lut: RationalLut[];
    length: number;

    constructor(controls: Point[]) {
        this.controls = controls;

        // LUT construction

        // First we want a LUT that will have un-even distance/t values
        let p_last = this.get_internal(0);
        let d_last = 0;
        let lut_tmp = [
            {
                p: p_last,
                t: 0,
                d: 0,
                angle: 0,
                a: 0,
                aa: 0,
            },
        ];
        for (let t = t_step; t <= 1.0; t += t_step) {
            let p = this.get_internal(t);
            let d = p.dist(p_last) + d_last;
            lut_tmp.push({
                p,
                t,
                d,
                angle: 0,
                a: 0,
                aa: 0,
            });
            p_last = p;
            d_last = d;
        }

        // Now we want to process those into an evenly spaced lut
        let d_step = t_step * d_last;
        let lut_last = 0;
        let lut_next = 1;
        let last_lut = lut_tmp[lut_last];
        this.lut = [last_lut];
        for (let d = d_step; d < d_last; d += d_step) {
            // Move our reference luts up, we want the last lut to be behind our
            //  desired distance value, our next lut to be ahead
            while (lut_tmp[lut_last + 1].d < d) {
                lut_last++;
            }

            while (lut_tmp[lut_next].d < d) {
                lut_next++;
            }

            // Now we can take a stab at where out t value may be
            let t_diff = lut_tmp[lut_next].t - lut_tmp[lut_last].t;
            let d_diff = lut_tmp[lut_next].d - lut_tmp[lut_last].d;
            let desired_d_diff = d - lut_tmp[lut_last].d;
            let t_guess =
                lut_tmp[lut_last].t + t_diff * (desired_d_diff / d_diff);
            let p_next = this.get_internal(t_guess);
            let next_lut = {
                p: p_next,
                t: t_guess,
                d: last_lut.d + last_lut.p.dist(p_next),
                angle: 0,
                a: 0,
                aa: 0,
            };
            this.lut.push(next_lut);
            last_lut = next_lut;
        }

        last_lut = {
            p: lut_tmp[lut_tmp.length - 1].p,
            t: 1,
            d: lut_tmp[lut_tmp.length - 1].p.dist(last_lut.p) + last_lut.d,
            angle: 0,
            a: 0,
            aa: 0,
        };

        this.lut.push(last_lut);

        // Now we can augment our lut with angle informatio
        for (let i = 1; i < this.lut.length - 1; i++) {
            let a = this.lut[i - 1];
            let b = this.lut[i];
            let c = this.lut[i + 1];

            let vec_ba = a.p.sub(b.p);
            let vec_bc = c.p.sub(b.p);

            let angle = vec_ba.angle(vec_bc);

            // Integral angles
            b.angle = angle;
            b.a = angle + a.a;
            b.aa = angle * angle + a.aa;
        }

        this.length = last_lut.d;
    }

    map_t(u: number): number {
        let length_desired = u * this.length;
        let lut_id = floor(u * this.lut.length);
        if (lut_id >= this.lut.length) {
            return 1.0;
        }
        let base_lut = this.lut[lut_id];

        let length_diff = base_lut.d - length_desired;

        if (length_diff == 0) {
            return base_lut.t;
        }

        let id_next = length_diff > 0 ? lut_id - 1 : lut_id + 1;
        let next_lut = this.lut[id_next];

        let t =
            base_lut.t +
            (next_lut.t - base_lut.t) *
                (length_diff / (next_lut.d - base_lut.d));

        return t;
    }

    get(u: number): Point {
        if (u <= 0) {
            return this.controls[0];
        } else if (u >= 1) {
            return this.controls[this.controls.length - 1];
        }
        return this.get_internal(this.map_t(u));
    }

    // Use the bernstein polynomial method to find the point
    get_internal(t: number): Point {
        if (t <= 0) {
            return this.controls[0];
        } else if (t >= 1) {
            return this.controls[this.controls.length - 1];
        }
        let n = this.controls.length - 1;
        let s = 1 - t;

        let init_point = new Point(0, 0, 0, 0);
        let denominator = 0;

        for (let i = 0; i < this.controls.length; i++) {
            let control = this.controls[i];
            let multiplier = control.w * s ** (n - i) * t ** i * binomial(n, i);
            denominator += multiplier;
            init_point = init_point.add(control.mul(multiplier));
        }

        return init_point.div(denominator);
    }

    // Converts the lut to a short list of 100 points
    as_list(): Point[] {
        return this.lut.filter((_, idx) => idx % 9 == 0).map((l) => l.p);
    }

    // Just use every 10th point from the LUT
    draw(dimension: number): IModel {
        let points = this.as_list().map((p) => p.to_ipoint(dimension));
        points.push(this.lut[this.lut.length - 1].p.to_ipoint(dimension));
        return new models.ConnectTheDots(false, points);
    }

    // Lut binary search method, a will be the lower lut method, b will be th
    find_in_lut(f: (p: Point) => number): RationalLut {
        let low = 0;
        let mid = 0;
        let high = this.lut.length - 1;

        while (low <= high) {
            mid = floor((low + high) / 2);
            let val = f(this.lut[mid].p);
            if (val > 0) {
                high = mid - 1;
            } else if (val < 0) {
                low = mid + 1;
            } else {
                break;
            }
        }
        return this.lut[mid];
    }

    // Binary search with safety for iterating on curve
    find_on_curve(
        t_min: number,
        t_max: number,
        f: (p: Point) => number
    ): {
        p: Point;
        t: number;
    } {
        let low = t_min;
        let mid = 0;
        let high = t_max;
        let p = this.get(mid);
        let safety = 0;

        while (low <= high && safety++ < 30) {
            mid = (low + high) / 2;
            p = this.get(mid);
            let val = f(p);
            if (val > 0) {
                high = mid - 1;
            } else if (val < 0) {
                low = mid + 1;
            } else {
                break;
            }
        }
        return { p, t: mid };
    }

    // Use a binary search on the lut to find our points that are higher and
    //  lower than the value we want
    find_dimm_dist(
        dimension: number,
        distance: number
    ): {
        p: Point;
        t: number;
    } {
        let linear_dist = (l: Point) => {
            switch (dimension) {
                case 2:
                    return l.z - distance;
                case 1:
                    return l.y - distance;
                default:
                    return l.x - distance;
            }
        };

        let closest_lut = this.find_in_lut(linear_dist);
        if (linear_dist(closest_lut.p) == 0) {
            return closest_lut;
        }

        return this.find_on_curve(
            closest_lut.t - t_step,
            closest_lut.t + t_step,
            linear_dist
        );
    }

    // This method allows us to get the area in a particular direction between
    //  two points
    find_area(
        t_low: number,
        t_up: number,
        height_dimm: number,
        width_dimm: number
    ): number {
        let area = 0;
        let t_step = (t_up - t_low) / 1000;
        let prev_point = this.get(t_low);
        for (let i = t_low + t_step; i < t_up; i += t_step) {
            let new_point = this.get(i);
            area += new_point.area(prev_point, height_dimm, width_dimm);
            prev_point = new_point;
        }
        return area;
    }

    find_segments(
        variance_tolerance: number,
        min_segments: number,
        max_segments: number
    ): RationalSegment[] {
        let min_id = 1;
        let max_id = this.lut.length - 2;
        let num_segs = min_segments;

        // We'll build our segments from these eventually
        let divisors: number[];
        let variance_max = 0;

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
                    let high = divisors[i + 1]

                    let curr_variance = this.calc_variance(mid, low);
                    let next_variance = this.calc_variance(high, mid);

                    let if_left_curr = this.calc_variance(mid - 1, low);
                    let if_left_next = this.calc_variance(high, mid - 1);

                    if (if_left_curr < curr_variance && if_left_next < next_variance) {
                        divisors[i]--;
                        changed = true;
                        continue;
                    }

                    let if_right_curr = this.calc_variance(mid + 1, low);
                    let if_right_next = this.calc_variance(high, mid + 1);

                    if (if_right_curr < curr_variance && if_right_next < next_variance) {
                        divisors[i]++;
                        changed = true;
                    }                    
                }
            } while (changed);

            // Find our maximum variance
            variance_max = 0;
            for (let i = 1; i < divisors.length; i++) {
                variance_max = max(
                    variance_max,
                    this.calc_variance(
                        divisors[i],
                        divisors[i - 1] - 1,
                    )
                );
            }

            // Move our first and last divisors to cover the whole line
            divisors[0] = 0;
            divisors[divisors.length - 1] = this.lut.length - 1;

            // Iterate our number of segments so that if we need to go again we
            //  add more segments to decrease the variance
        } while (
            variance_max > variance_tolerance &&
            num_segs++ < max_segments
        );

        let segments = [];
        for (let i = 0; i < divisors.length - 1; i++) {
            segments.push(
                new RationalSegment(this, divisors[i], divisors[i + 1])
            );
        }
        return segments;
    }

    private calc_variance(id_b: number, id_a: number) {
        let sum_sq = this.lut[id_b].aa - this.lut[id_a].aa;
        let sum = this.lut[id_b].a - this.lut[id_a].a;
        let n = id_b - id_a;
        return (sum_sq - (sum * sum) / n) / (n - 1);
    }
}
