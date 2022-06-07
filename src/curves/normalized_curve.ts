import { abs, ceil, floor, max, min, sign } from "mathjs";
import { RationalPlane } from "../euclidean/rational_plane";
import { Point } from "../euclidean/rational_point";
import { interpolate_steps } from "../utils/rational_math";

export interface RationalLut<P extends Point> {
    p: P;
    pv: P;
    b_max: P;
    b_min: P;
    t: number;
    d: number;
    angle: number;
    a: number;
    aa: number;
}

export const MAX_RESOLUTION = 250;
export const MIN_STEP = 1 / MAX_RESOLUTION;
export const MIN_STEP_FACTOR = 4 / 5;

export abstract class NormalizedCurve<P extends Point> {
    length: number = 0;
    lut: RationalLut<P>[] = [];
    corners: P[] = [];
    bounds_max: P;
    bounds_min: P;

    constructor(p_init: P) {
        this.bounds_min = p_init;
        this.bounds_max = p_init;
    }

    populate_lut() {
        {
            const first_point = this.get_internal(0);
            const last_point = this.get_internal(1);
            const arcs_a: { t: number; d: number }[] = new Array(
                MAX_RESOLUTION + 1
            );
            const arcs_b: { t: number; d: number }[] = new Array(
                MAX_RESOLUTION + 1
            );

            // Generate our initial arc lengths
            let d = 0;
            let p_last = first_point;
            for (let i = 0; i <= MAX_RESOLUTION; i++) {
                const t = i / MAX_RESOLUTION;
                const p_next = this.get_internal(t);
                d += p_next.dist(p_last);
                arcs_a[i] = {
                    t,
                    d,
                };
                arcs_b[i] = {
                    t,
                    d,
                };
            }

            let rounds = 20;
            let which = true;
            while (rounds-- > 0) {
                const arcs_ref = which ? arcs_b : arcs_a;
                const arcs_fill = which ? arcs_a : arcs_b;
                which = !which;

                const l_max = arcs_ref[MAX_RESOLUTION].d;
                let idx_arc = 0;

                let p_last = first_point;
                for (let i = 1; i < MAX_RESOLUTION; i++) {
                    const u = i / MAX_RESOLUTION;
                    const d_des = l_max * u;

                    while (
                        idx_arc < MAX_RESOLUTION - 1 &&
                        arcs_ref[idx_arc + 1].d < d_des
                    ) {
                        idx_arc++;
                    }

                    if (arcs_ref[idx_arc].d == d_des) {
                        arcs_fill[i] = arcs_ref[idx_arc];
                    }

                    const d_diff =
                        arcs_ref[idx_arc + 1].d - arcs_ref[idx_arc].d;
                    const d_rel = d_des - arcs_ref[idx_arc].d;
                    const tau = d_rel / d_diff;
                    const s = 1 - tau;
                    const t =
                        s * arcs_ref[idx_arc].t + tau * arcs_ref[idx_arc + 1].t;
                    const p = this.get_internal(t);
                    const d = p.dist(p_last) + arcs_fill[i - 1].d;
                    p_last = p;
                    arcs_fill[i] = {
                        t,
                        d,
                    };
                }

                arcs_fill[MAX_RESOLUTION].d =
                    arcs_fill[MAX_RESOLUTION - 1].d + p_last.dist(last_point);
            }

            const arc_lengths = which ? arcs_b : arcs_a;

            const zero = first_point.zero();
            let lut_last = <RationalLut<P>>{
                p: first_point,
                pv: zero,
                b_min: zero,
                b_max: zero,
                t: 0,
                d: 0,
                angle: 0,
                a: 0,
                aa: 0,
            };
            this.lut = [lut_last];

            for (let i = 1; i < arc_lengths.length; i++) {
                const p_new = this.get_internal(arc_lengths[i].t);
                this.bounds_max = <P>this.bounds_max.max(p_new);
                this.bounds_min = <P>this.bounds_min.min(p_new);

                let new_lut = <RationalLut<P>>{
                    p: p_new,
                    pv: <P>p_new.sub(lut_last.p).as_unit(),
                    b_min: <P>lut_last.p.min(p_new),
                    b_max: <P>lut_last.p.max(p_new),
                    t: arc_lengths[i].t,
                    d: arc_lengths[i].d,
                    angle: 0,
                    a: 0,
                    aa: 0,
                };
                this.lut.push(new_lut);
                lut_last = new_lut;
            }
        }

        // Now we can augment our lut with angle informatio
        for (let i = 1; i < MAX_RESOLUTION; i++) {
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

        this.length = this.lut[MAX_RESOLUTION].d;
        this.corners = <P[]>this.bounds_min.corners(this.bounds_max);
    }

    get(u: number): P {
        const d_check = u * this.length;
        let lut_id = floor(u * this.lut.length);

        if (lut_id <= 0) {
            return this.lut[0].p;
        }

        if (lut_id >= MAX_RESOLUTION) {
            return this.lut[MAX_RESOLUTION].p;
        }

        while (this.lut[lut_id].d > d_check) {
            lut_id = lut_id - 1;
        }

        while (this.lut[lut_id + 1].d < d_check) {
            lut_id = lut_id + 1;
        }

        // Get the LUT AFTER the desired distance, then we linearly interpolate
        //  forwards from the previous LUT
        const lut_high = this.lut[lut_id + 1];
        const lut_low = this.lut[lut_id];
        const d_diff = lut_high.d - lut_low.d;
        const d_remaining = d_check - lut_low.d;
        const tau = d_remaining / d_diff;
        const s = 1 - tau;
        const t = s * lut_low.t + tau * lut_high.t;
        return this.get_internal(t);
    }

    // Lut binary search method, a will be the lower lut method, b will be th
    find_in_lut(f: (p: P) => number): {
        l: RationalLut<P>;
        id: number;
    } {
        let low = 0;
        let mid = 0;
        let high = MAX_RESOLUTION;

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
        return { l: this.lut[mid], id: mid };
    }

    // Ternary search for lowest value
    find_smallest_on_curve(
        t_min: number,
        t_max: number,
        f: (p: P) => number
    ): {
        p: P;
        t: number;
    } {
        let low = t_min;
        let high = t_max;
        let mid_2 = (high + low) / 2;
        let p_2 = this.get(mid_2);
        let d_2 = f(p_2);
        let safety = 0;

        do {
            const step = (high - low) / 4;
            const mid_1 = low + step;
            const p_1 = this.get(mid_1);
            const d_1 = f(p_1);
            const mid_3 = high - step;
            const p_3 = this.get(mid_3);
            const d_3 = f(p_3);

            if (d_1 < d_2 && d_1 < d_3) {
                // low = low
                high = mid_2;
                mid_2 = mid_1;
                p_2 = p_1;
                d_2 = d_1;
            } else if (d_2 < d_3) {
                low = mid_2;
                // high = high
                mid_2 = mid_3;
                p_2 = p_3;
                d_2 = d_3;
            } else {
                low = mid_1;
                high = mid_3;
            }
        } while (d_2 > 0 && safety++ < 30);

        return {
            p: p_2,
            t: mid_2,
        };
    }

    // Binary search with safety for iterating on curve
    find_on_curve(
        t_min: number,
        t_max: number,
        f: (p: P) => number
    ): {
        p: P;
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
        p: P;
        t: number;
    } {
        let linear_dist = (l: P) => {
            return l.dimm_dist_f(dimension, distance);
        };

        const closest_lut = this.find_in_lut(linear_dist);
        if (linear_dist(closest_lut.l.p) == 0) {
            return {
                p: closest_lut.l.p,
                t: closest_lut.l.d / this.length,
            };
        }

        return this.find_on_curve(
            this.lut[max(0, closest_lut.id - 1)].d / this.length,
            this.lut[min(MAX_RESOLUTION, closest_lut.id + 1)].d / this.length,
            linear_dist
        );
    }

    find_plane_intersection(plane: RationalPlane): {
        p: P;
        t: number;
    }[] {
        let intersects = 0;
        for (let i = 0; i < this.corners.length; i++) {
            intersects += sign(
                this.corners[i].sub(plane.origin).dot(plane.direction)
            );
        }
        if (abs(intersects) == this.corners.length) {
            return [];
        }

        const results: {
            p: P;
            t: number;
        }[] = [];

        for (let i = 1; i < this.lut.length; i++) {
            const lut = this.lut[i];
            const last = this.lut[i - 1];

            let dot_lut = lut.p.sub(plane.origin).dot(plane.direction);
            let dot_last = last.p.sub(plane.origin).dot(plane.direction);

            if (sign(dot_lut) == sign(dot_last)) {
                continue;
            }
            dot_lut = abs(dot_lut);
            dot_last = abs(dot_last);

            if (dot_lut < 1e-15) {
                results.push({
                    p: lut.p,
                    t: lut.t,
                });
                continue;
            }

            if (dot_last < 1e-15) {
                results.push({
                    p: last.p,
                    t: last.t,
                });
                continue;
            }

            // Relative distance of projection
            const u = dot_lut / (dot_lut + dot_last);
            const s = 1 - u;

            // Linearily interpolate to get p & t
            results.push({
                p: <P>lut.p.mul(s).add(last.p.mul(u)),
                t: lut.t * s + last.t * u,
            });
        }
        return results;
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

    // Returns a number relative to the length of the lut between two points,
    //  this can be used to avoid collision due to linear interpolation
    get_min_resolution(t_min: number, t_max: number): number {
        const t_low = min(t_min, t_max);
        const t_high = max(t_min, t_max);
        let id_low = floor(t_low * this.lut.length);
        let id_high = floor(t_high * this.lut.length);
        return ceil(MIN_STEP_FACTOR * (id_high - id_low));
    }

    get_n_in_range(n: number, t_min: number, t_max: number) {
        const results: P[] = [];

        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const s = 1 - t;
            const u = t_min * s + t_max * t;
            results.push(this.get(u));
        }

        return results;
    }

    as_list(): P[] {
        return this.lut.map((l) => l.p);
    }

    abstract get_internal(u: number): P;
}
