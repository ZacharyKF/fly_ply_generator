import { IModel, models } from "makerjs";
import {
    abs,
    ceil,
    floor,
    inv,
    matrix,
    Matrix,
    max,
    min,
    multiply,
    sqrt,
    transpose,
} from "mathjs";
import { binomial } from "./math";
import { Point3D } from "./rational_point";
import { RationalSegment } from "./rational_segment";

const RESOLUTION = 1000;
const T_STEP = 1.0 / RESOLUTION;

export interface RationalLut {
    p: Point3D;
    t: number;
    d: number;
    angle: number;
    a: number;
    aa: number;
}

export class RationalBezier {
    controls: Point3D[];
    lut: RationalLut[];
    length: number;

    constructor(controls: Point3D[]) {
        this.controls = controls;

        // Before constructing the lut we want to get an estimate of the length
        let length = 0;
        for (let i = 1; i < controls.length; i++) {
            length += controls[i - 1].dist(controls[i]);
        }
        length = (length * 2) / 3;
        length += controls[0].dist(controls[controls.length - 1]) / 3;

        // Now we want to create evenly spaced items along the curve
        let length_step = length / RESOLUTION;
        let length_current = length_step;
        let t_current = 1.0 / (RESOLUTION * 10);
        let lut_last = {
            p: controls[0],
            t: 0,
            d: 0,
            angle: 0,
            a: 0,
            aa: 0,
        };
        this.lut = [lut_last];

        /**
         * The loop here is pretty simple. We hold on to the last point, we take
         *  a guess at where the next point is. Then we linearily interpolate
         *  three times to try and fit at the specified distance. The points
         *  only really need to be the "closest" to a particular distance.
         */
        const guess_resolution = length_step / 3;
        while (t_current <= 1.0) {
            let d_remaining = length_current - lut_last.d;
            let p_guess = this.get_internal(t_current);
            let d_guess = p_guess.dist(lut_last.p);

            while (
                abs(d_remaining - d_guess) > guess_resolution &&
                t_current < 1.0
            ) {
                const t_diff = t_current - lut_last.t;
                const d_diff_rel = (d_remaining - d_guess) / d_guess;
                const t_move = t_diff * d_diff_rel;

                // Update the variables
                t_current = min(1.0, t_move + t_current);
                p_guess = this.get_internal(t_current);
                d_guess = p_guess.dist(lut_last.p);
            }

            let new_lut = {
                p: p_guess,
                t: t_current,
                d: lut_last.d + d_guess,
                angle: 0,
                a: 0,
                aa: 0,
            };
            this.lut.push(new_lut);

            // Take a linear step forward
            t_current = new_lut.t + (new_lut.t - lut_last.t);
            length_current += length_step;
            lut_last = new_lut;
        }
        this.length = lut_last.d;

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

        for (let i = 1; i < this.lut.length; i++) {
            if (this.lut[i].p.dist(this.lut[i - 1].p) == 0) {
                console.error("==== ERRANT LUT ====");
                console.error(this.lut.length);
                console.error(this.controls);
                console.error("=> Prev");
                console.error(this.lut[i - 1]);
                console.error("=> Curr");
                console.error(this.lut[i]);
                throw new Error("Errant LUT");
            }
        }
    }

    map_t(u: number): number {
        // Get the LUT AFTER the desired distance, then we linearly interpolate
        //  forwards from the previous LUT
        const lut_id = ceil(u * (this.lut.length - 1));
        const d_diff = this.lut[lut_id].d - this.lut[lut_id - 1].d;
        const t_diff = this.lut[lut_id].t - this.lut[lut_id - 1].t;
        const length_diff = u * this.length - this.lut[lut_id - 1].d;
        return t_diff * (length_diff / d_diff) + this.lut[lut_id - 1].t;
    }

    get(u: number): Point3D {
        if (u <= 0) {
            return this.controls[0];
        } else if (u >= 1) {
            return this.controls[this.controls.length - 1];
        }
        return this.get_internal(this.map_t(u));
    }

    get_struts(t: number): Point3D[][] {
        return this.get_struts_internal(t, 1 - t, this.controls, []);
    }

    get_struts_internal(t:number, s: number, level: Point3D[], struts: Point3D[][]): Point3D[][] {
        
        // No matter what, add the current level to the return
        struts.push(level);

        // If we're at the last level then break out
        if (level.length == 1) {
            return struts;
        }

        // Otherwise we need to calculate the new points, there will be 
        //  level.length - 1 new points
        let new_points: Point3D[] = new Array(level.length - 1);
        for(let i = 0; i < level.length - 1; i++) {
            const weight = (level[i].w * s) + (level[i + 1].w * t);
            const left = level[i].mul(s * level[i].w / weight);
            const right = level[i + 1].mul(t * level[i + 1].w / weight);
            const new_point = right.add(left);
            new_point.w = weight;
            new_points[i] = new_point;
        }

        return this.get_struts_internal(t, s, new_points, struts);
    }

    // Use the bernstein polynomial method to find the point
    get_internal(t: number): Point3D {
        if (t <= 0) {
            return this.controls[0];
        } else if (t >= 1) {
            return this.controls[this.controls.length - 1];
        }
        let n = this.controls.length - 1;
        let s = 1 - t;

        let init_point = new Point3D(0, 0, 0, 0);
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
    as_list(): Point3D[] {
        return this.lut.filter((_, idx) => idx % 9 == 0).map((l) => l.p);
    }

    // Just use every 10th point from the LUT
    draw(dimension: number): IModel {
        let points = this.as_list().map((p) => p.to_ipoint(dimension));
        points.push(this.lut[this.lut.length - 1].p.to_ipoint(dimension));
        return new models.ConnectTheDots(false, points);
    }

    // Lut binary search method, a will be the lower lut method, b will be th
    find_in_lut(f: (p: Point3D) => number): RationalLut {
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
        f: (p: Point3D) => number
    ): {
        p: Point3D;
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
        p: Point3D;
        t: number;
    } {
        let linear_dist = (l: Point3D) => {
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
            closest_lut.t - T_STEP,
            closest_lut.t + T_STEP,
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
        let total_error = 0;
        let segments: RationalSegment[] = [];

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
                let new_seg = new RationalSegment(
                    this,
                    divisors[i],
                    divisors[i + 1]
                );
                total_error += new_seg.error;
                segments.push(new_seg);
            }
            // Iterate our number of segments so that if we need to go again we
            //  add more segments to decrease the variance
        } while (total_error > variance_tolerance && num_segs++ < max_segments);

        return segments;
    }

    private calc_center(
        id_b: number,
        id_a: number
    ): {
        x: number;
        y: number;
    } {
        let sum = this.lut[id_b].a - this.lut[id_a].a;
        let n = id_b - id_a;
        return {
            x: (id_b + id_a) / 2,
            y: sum / n,
        };
    }

    private calc_dist(id: number, p: { x: number; y: number }): number {
        let lut = this.lut[id];
        let d_x = id - p.x;
        let d_y = lut.angle - p.y;
        return sqrt(d_x * d_x + (d_y * d_y) / 2);
    }

    split(t_split: number): {
        upper: RationalBezier;
        lower: RationalBezier;
    } {
        let struts = this.get_struts(t_split);
        let left: Point3D[] = [];
        let right: Point3D[] = [];

        for(let i = 0; i < struts.length; i ++){
            let level = struts[i];
            left.push(level[0]);
            right.unshift(level[level.length - 1]);
        }

        return {
            upper: new RationalBezier(right),
            lower: new RationalBezier(left),
        };
    }

    // We're going to solve this numerically
    split_segment(t_lower: number, t_upper: number): RationalBezier {
        let t_up = max(t_lower, t_upper);
        let t_down = min(t_lower, t_upper);

        if (t_down <= 0 && t_up >= 1) {
            return this;
        }

        if (t_down <= 0) {
            return this.split(t_up).lower;
        }

        if (t_up >= 1) {
            return this.split(t_down).upper;
        }

        let curve_upper = this.split(t_down).upper;
        let p_split_next = this.get(t_up);
        let t_split_next = curve_upper.find_on_curve(0, 1, (p) =>
            p.dist(p_split_next)
        ).t;
        let curve_final = curve_upper.split(t_split_next).lower;
        return curve_final;
    }

    static fit_to_points(points: Point3D[], order: number): RationalBezier {
        let controls = RationalBezier.fit_controls(points);
        controls = RationalBezier.reduce_order(controls, order);
        return new RationalBezier(controls);
    }

    static fit_controls(points: Point3D[]): Point3D[] {
        let controls: Point3D[] = [];

        // This is just a straight-ish line so slap the midpoint in the middle
        if (points.length == 2 || points.length > 4) {
            let temp = points.pop();
            if (temp != undefined) {
                controls.push(points[0]);
                controls.push(points[0].add(temp).div(2));
                controls.push(temp);
            }
            return controls;
        }

        let t_values = RationalBezier.calculate_t_vals(points);
        let { T, Tt } = RationalBezier.formTMatrix(t_values);

        // Constructing M Matrix
        let m_data: number[][] = [];
        let k = points.length - 1;
        for (let i = 0; i < points.length; i++) {
            m_data.push(points.map((v) => 0));
            m_data[i][i] = binomial(k, i);
        }

        for (let c = 0, r; c < points.length; c++) {
            for (r = c + 1; r < points.length; r++) {
                let sign = (r + c) % 2 == 0 ? 1 : -1;
                m_data[r][c] = sign * binomial(r, c) * m_data[r][r];
            }
        }

        let m: Matrix = matrix(m_data);
        let m_invert: Matrix = inv(m);

        // Getting to the good stuff
        let t_trans_mul_t_inverse = inv(multiply(Tt, T));
        let step_1 = multiply(t_trans_mul_t_inverse, Tt);
        let step_2 = multiply(m_invert, step_1);
        let x_big: Matrix = matrix(points.map((v) => [v.x]));
        let cx: Matrix = multiply(step_2, x_big);
        let x: number[][] = <number[][]>cx.toArray();

        let y_big: Matrix = matrix(points.map((val) => [val.y]));
        let cy = multiply(step_2, y_big);
        let y: number[][] = <number[][]>cy.toArray();

        let bezier_points = x.map((row, idx) => {
            return new Point3D(row[0], y[idx][0], 0, 0);
        });

        // Re-adjust the start and end to prevent drift
        bezier_points[0] = points[0];
        bezier_points[bezier_points.length - 1] = points[points.length - 1];

        return bezier_points;
    }

    static calculate_t_vals(datum: Point3D[]): number[] {
        const D = [0];
        for (let i = 1; i < datum.length; i++) {
            let dist = datum[0].dist(datum[1]);
            D.push(dist + D[D.length - 1]);
        }
        let len = D[D.length - 1];
        let S = D.map((val) => val / len);
        S[S.length - 1] = 1.0;
        return S;
    }

    static formTMatrix(row: number[]): {
        T: Matrix;
        Tt: Matrix;
    } {
        // it's actually easier to create the transposed
        // version, and then (un)transpose that to get T!
        let data = [];
        for (var i = 0; i < row.length; i++) {
            data.push(row.map((v) => v ** i));
        }
        const Tt = matrix(data);
        const T = transpose(Tt);
        return { T, Tt };
    }

    static reduce_order(controls: Point3D[], order: number): Point3D[] {
        if (controls.length - 1 <= order) {
            return controls;
        }

        let new_controls: Point3D[] = new Array(order + 1);
        new_controls.fill(Point3D.Zero);
        let n = controls.length - 1;
        let m = new_controls.length - 1;
        let k = 1;
        let l = 1;

        // We have curve of degree <= n
        //
        //                         n
        //                      ,-----,
        //                       \           n
        //                   v =  )    controls[i] B  .
        //                       /           i
        //                      '-----'
        //                       i = 0
        //
        // We are looking for control points
        //
        //      new_controls[i], i = 0, 1, ..., k - 1, m - l + 1, m - l + 2, ..., m
        //
        // of a curve of degree <= m
        //
        //                         m
        //                      ,-----,
        //                       \           m
        //                   w =  )    new_controls[i] B  .
        //                       /           i
        //                      '-----'
        //                       i = 0
        //
        // Satisfying
        //
        //         (i)     (i)
        //        w (0) = v (0)  for  i = 0, 1, ..., k - 1,
        //
        //         (i)     (i)
        //        w (1) = v (1)  for  i = m - l + 1, m - l + 2, ..., m.
        //
        // This is possible because these conditions are not dependent on
        // the points new_controls[k], new_controls[k + 1], ..., new_controls[m - l].

        // if (k + l > m + 1) return false;

        // new_controls[i] for i = 0, 1, ..., k - 1 can be computed by evaluating
        //
        //                                i
        //                (n - i + 1)  ,-----,
        //                           i  \        i + j / i \
        //         new_controls[i] = ------------   )   (-1)      |   | controls[j]
        //                (m - i + 1)   /              \ j /
        //                           i '-----'
        //                              j = 0
        //                i - 1
        //               ,-----,
        //                \       i + j / i \
        //              -  )   (-1)     |   | new_controls[j]
        //                /             \ j /
        //               '-----'
        //                j = 0

        let p = 1;
        for (let i = 0; i < k; ++i) {
            let b = i % 2 == 0 ? 1 : -1;
            for (let j = 0; j <= i; ++j) {
                new_controls[i] = new_controls[i].add(controls[j].mul(b));
                // We assume new_controls[i] = 0 initially.
                b *= j - i;
                b /= j + 1;
            }

            new_controls[i] = new_controls[i].mul(p);
            p *= (n - i) / (m - i);

            b = i % 2 == 0 ? 1 : -1;
            for (let j = 0; j < i; ++j) {
                new_controls[i] = new_controls[i].sub(new_controls[j].mul(b));
                b *= j - i;
                b /= j + 1;
            }
        }

        // Similarily new_controls[m - i]'s are computed by evaluating
        //
        //                                i
        //                (n - i + 1)  ,-----,
        //                           i  \        j / i \
        //     new_controls[m - i] = ------------   )   (-1)  |   | controls[n - i + j]
        //                (m - i + 1)   /          \ j /
        //                           i '-----'
        //                              j = 0
        //                i - 1
        //               ,-----,
        //                \        j / i \
        //              -  )   (-1)  |   | new_controls[m - i + j]
        //                /          \ j /
        //               '-----'
        //                j = 1
        //

        p = 1;
        for (let i = 0; i < l; ++i) {
            let b = 1;
            for (let j = 0; j <= i; ++j) {
                new_controls[m - i] = new_controls[m - i].add(
                    controls[n - i + j].mul(b)
                ); // We assume new_controls[m - i] = 0
                b *= j - i; // initially.
                b /= j + 1;
            }

            new_controls[m - i] = new_controls[m - i].mul(p);
            p *= (n - i) / (m - i);

            b = -i;
            for (let j = 1; j <= i; ++j) {
                new_controls[m - i] = new_controls[m - i].sub(
                    new_controls[m - i + j].mul(b)
                );
                b *= j - i;
                b /= j + 1;
            }
        }

        // Now call the child class' ReduceInner method to determine the
        // remaining control points.

        // if (m - k - l + 1 == 0) return true;

        // We have curve of degree <= n
        //
        //                         n
        //                      ,-----,
        //                       \           n
        //                   v =  )    controls[i] B  .
        //                       /           i
        //                      '-----'
        //                       i = 0
        //
        // And already computed points
        //
        //      new_controls[i], i = 0, 1, ..., k - 1, m - l + 1, m - l + 2, ..., m
        //
        // of a curve of degree <= m
        //
        //                         m
        //                      ,-----,
        //                       \           m
        //                   w =  )    new_controls[i] B  ,
        //                       /           i
        //                      '-----'
        //                       i = 0
        //
        // that ensure
        //
        //         (i)     (i)
        //        w (0) = v (0)  for  i = 0, 1, ..., k - 1,
        //
        //         (i)     (i)
        //        w (1) = v (1)  for  i = m - l + 1, m - l + 2, ..., m.
        //
        // No matter what the remaining new_controls[i]'s are.

        // Generate nodes x[i], i = 0, 1, ..., m - k - l, where
        //
        //   0 < x[0] < x[1] < ... < x[m - k - l - 1] < x[m - k - l] < 1.

        let x: number[] = new Array(m - k - l + 1);
        for (let i = 0; i <= m - k - l; ++i) x[i] = (i + 1) / (m - k - l + 2);

        // Our goal is to construct new_controls[k], new_controls[k + 1], ..., new_controls[m - l + 1], such
        // that w interpolates v in points x[i], i.e. w(x[i]) = v(x[i]).

        // We now compute values y[i] = v(x[i]), i = 0, 1, ..., m - k - l
        // and to save up memory, we store then in array W: new_controls[k + i] = y[i].

        for (let i = 0; i <= m - k - l; ++i) {
            let t = x[i];
            if (t <= 0) {
                new_controls[k + i] = controls[0];
                continue;
            } else if (t >= 1) {
                new_controls[k + i] = controls[controls.length - 1];
                continue;
            }
            let n = controls.length - 1;
            let s = 1 - t;

            let init_point = new Point3D(0, 0, 0, 0);
            let denominator = 0;

            for (let j = 0; j < controls.length; j++) {
                let control = controls[j];
                let multiplier =
                    control.w * s ** (n - j) * t ** j * binomial(n, j);
                denominator += multiplier;
                init_point = init_point.add(control.mul(multiplier));
            }

            new_controls[k + i] = init_point.div(denominator);
        }

        // Compute auxiliary values d[i], i = 0, 1, ..., m - k - l defined
        // by recurrence relation
        //
        //              (0)         z[i]
        //             d [i] = ----------------,
        //                         k          l
        //                     x[i] (1 - x[i])
        //
        //                      (j - 1)     (j - 1)
        //             (j)     d     [i] - d     [i - 1]
        //             d [i] = -------------------------
        //                         x[i] - x[i - j]
        //
        // for j = 1, 2, ..., m - k - l and i = j, j + 1, ..., m - k - l,
        // where
        //                    k - 1                  m
        //                   ,-----,              ,-----,
        //                    \          m         \           m
        //      z[i] = y[i] -  )   new_controls[j] B (x[i]) -  )    new_controls[j] B (x[i]).
        //                    /          j         /           j
        //                   '-----'              '-----'
        //                    j = 0            j = m - l + 1
        //
        // which gives
        //
        //
        //           (0)          y[i]
        //          d [i] = ----------------
        //                      k          l
        //                  x[i] (1 - x[i])
        //
        //                  k - 1
        //                 ,-----,                    m - j - l
        //                  \         / m \ (1 - x[i])
        //                -  )   new_controls[j] |   | -------------------
        //                  /         \ j /         k - j
        //                 '-----'              x[i]
        //                  j = 0
        //
        //                    m
        //                 ,-----,                   j - k
        //                  \         / m \      x[i]
        //                -  )   new_controls[j] |   | -------------------
        //                  /         \ j /           l + j - m
        //                 '-----'          (1 - x[i])
        //              j = m - l + 1
        //
        //                                      (i)
        // And after all that we define d[i] = d [i]. Again, to save up
        // space we store values d[i] in array W: new_controls[k + i] = d[i].

        for (let i = 0; i <= m - k - l; ++i) {
            let a = x[i];
            let c = 1 - a;
            let aoc = a / c;
            let coa = c / a;

            new_controls[k + i] = new_controls[k + i].mul(
                1 / (a ** k * c ** l)
            );

            let b = 1;
            let f = c ** (m - l) / a ** k;
            for (let j = 0; j < k; ++j) {
                new_controls[k + i] = new_controls[k + i].sub(
                    new_controls[j].mul(b * f)
                );
                b *= m - j;
                b /= j + 1;
                f *= aoc;
            }

            b = 1;
            f = a ** (m - k) / c ** l;
            for (let j = m; j > m - l; --j) {
                new_controls[k + i] = new_controls[k + i].sub(
                    new_controls[j].mul(b * f)
                );
                b *= j;
                b /= m - j + 1;
                f *= coa;
            }
        }

        for (let j = 1; j <= m - k - l; ++j)
            for (let i = m - k - l; i >= j; --i)
                new_controls[k + i] = new_controls[k + i]
                    .sub(new_controls[k + i - 1])
                    .mul(1 / (x[i] - x[i - j]));

        // Compute auxiliary values u[i], i = 0, 1, ..., m - k - l, given by
        // recurrence relation for j = 1, 2, ..., m - k - l
        // and i = 0, 1, ..., j:
        //
        //             (0)
        //            u  [0] = d[0],
        //
        //             (j)       i    (j - 1)
        //            u  [i] =  ---  u     [i - 1]
        //                       j
        //
        //                     j - i  (j - 1)          (j)
        //                   + ----- u     [i] + d[i] t [i],
        //                       j
        //               (j)
        // where values t [i] are defined by
        //
        //          (0)
        //         t  [0] = 1,
        //
        //          (j)       i                   (j - 1)
        //         t  [i] =  ---  (1 - x[j - 1]) t     [i - 1]
        //                    j
        //
        //                  j - i           (j - 1)
        //                - ----- x[j - 1] t     [i].
        //                    j

        let u: Point3D[] = new Array(m - k - l + 1);
        let t: number[] = new Array(m - k - l + 1);
        u[0] = new_controls[k];
        t[0] = 1;
        for (let j = 1; j <= m - k - l; ++j) {
            let a = x[j - 1];
            let c = 1 - a;
            for (let i = j; i > 0; --i) {
                t[i] = (i / j) * c * t[i - 1] - ((j - i) / j) * a * t[i];

                u[i] = u[i - 1]
                    .mul(i / j)
                    .add(u[i].mul((j - i) / j))
                    .add(new_controls[k + j].mul(t[i]));
            }
            t[0] = -a * t[0];
            u[0] = u[0].add(new_controls[k + j].mul(t[0]));
        }

        // Finally compute remaining points new_controls[i], i = k, k + 1, ..., m - l,
        // using auxiliary values
        //
        //                             / m - k - l \ / m \-1
        //             new_controls[i] = u[i - k] |           | |   |
        //                             \   i - k   / \ i /

        let s = 1;
        for (let i = 0; i < k; ++i) {
            s *= i + 1;
            s /= m - i;
        }
        for (let i = k; i <= m - l; ++i) {
            new_controls[i] = u[i - k].mul(s);
            s *= ((i + 1) * (m - l - i)) / ((i - k + 1) * (m - i));
        }

        return new_controls;
    }
}
