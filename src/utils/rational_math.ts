import { abs, cos, floor, min, pi, sqrt } from "mathjs";
import { RationalBezier } from "../curves/rational_bezier";
import { RationalInterval } from "../curves/rational_interval";
import { Point, Point2D, Point3D } from "../euclidean/rational_point";

// Taken from https://stackoverflow.com/questions/13977354/build-circle-from-3-points-in-3d-space-implementation-in-c-or-c
export function circle_center<T extends Point>(
    a: T,
    b: T,
    c: T
): T | undefined {
    // triangle "edges"
    const t = b.sub(a);
    const u = c.sub(a);
    const v = c.sub(b);

    // triangle normal
    const w = t.cross_mag(u);
    const wsl = w * w;
    if (wsl < 10e-14) return undefined; // area of the triangle is too small (you may additionally check the points for colinearity if you are paranoid)

    // helpers
    const iwsl2 = 1.0 / (2.0 * wsl);
    const tt = t.magnitude() * t.magnitude();
    const uu = u.magnitude() * u.magnitude();

    // result circle
    const center = a
        .add(
            u
                .mul(tt)
                .mul(u.dot(v))
                .sub(t.mul(uu).mul(t.dot(v)))
        )
        .mul(iwsl2);
    // Vector3d circCenter = p1 + (u*tt*(u*v) - t*uu*(t*v)) * iwsl2;
    // double   circRadius = sqrt(tt * uu * (v*v) * iwsl2*0.5);
    // Vector3d circAxis   = w / sqrt(wsl);
    return <T>center;
}

// Stores our pascal expansions so we don't need to re-fetch them
var binomial_expansion: number[][] = [
    [1],
    [1, 1],
    [1, 2, 1],
    [1, 3, 3, 1],
    [1, 4, 6, 4, 1],
];

// Function for fetching expansions on demand
export function binomial(n: number, k: number): number {
    if (n === 0) return 1;
    while (n >= binomial_expansion.length) {
        var s = binomial_expansion.length;
        var nextRow = [1];
        for (var i = 1, prev = s - 1; i < s; i++) {
            nextRow[i] =
                binomial_expansion[prev][i - 1] + binomial_expansion[prev][i];
        }
        nextRow[s] = 1;
        binomial_expansion.push(nextRow);
    }
    return binomial_expansion[n][k];
}

export interface UnrollResult {
    a_flat: Point2D[];
    b_flat: Point2D[];
    f1f4_dir: Point2D;
    fnfn_less1_dir: Point2D;
    f2f1_dir: Point2D;
    f3nf4n_dir: Point2D;
}

export function triangle_area<P extends Point>(a: P, b: P, c: P): number {
    const vec_a = a.sub(b);
    const vec_b = c.sub(b);
    return 0.5 * abs(vec_a.cross_mag(vec_b));
}

export function unwrap_triple(
    a_1: Point3D,
    a_2: Point2D,
    b_1: Point3D,
    b_2: Point2D,
    c: Point3D,
    clockwise: boolean
): Point2D {
    // c is the point we're trying to flatten
    //  a ---- b
    //  |     /
    //  |   /
    //  | /
    //  c
    const angle_cab = c.sub(a_1).angle(b_1.sub(a_1));
    const angle_ab = a_2.axis_angle(0, b_2);
    const d_ca = c.dist(a_1);

    if (clockwise) {
        return a_2.flat_rotation(0, d_ca, angle_ab - angle_cab);
    } else {
        return a_2.flat_rotation(0, d_ca, angle_ab + angle_cab);
    }
}

// p1 is the flattened point from the top right of the bezier, everything is unrolled from this point, it returns the
//  flattened point arrays of both
export function unroll_point_set(
    a: Point3D[],
    b: Point3D[],
    reverse_points: boolean,
    f2_init: Point2D,
    f2f3_dir: Point2D,
    dir_init: Point2D,
    use_dir_init: boolean
): UnrollResult {
    let points_a: Point3D[] = [];
    let points_b: Point3D[] = [];

    const steps = min(a.length, b.length);
    if (a.length < b.length) {
        points_a = [...a];
        points_b = interpolate_steps(b, steps);
    } else if (b.length < a.length) {
        points_a = interpolate_steps(a, steps);
        points_b = [...b];
    } else {
        points_a = [...a];
        points_b = [...b];
    }

    if (reverse_points) {
        points_a = points_a.reverse();
        points_b = points_b.reverse();
    }

    return unroll_internal(
        points_a,
        points_b,
        f2_init,
        f2f3_dir,
        dir_init,
        use_dir_init
    );
}

export function middle_value<T>(arr: T[]): T {
    return arr[floor(arr.length / 2)];
}

export function relay_line<P extends Point>(line: P[], n: number): P[] {
    if (line.length == n) {
        return line;
    }

    // First create a array with distance information
    const dists: number[] = new Array(line.length);
    dists[0] = 0;
    for (let i = 1; i < line.length; i++) {
        const d = line[i].dist(line[i - 1]);
        dists[i] = dists[i - 1] + d;
    }
    const length = dists[dists.length - 1];

    // Populate the first two items
    const result: P[] = new Array(n);

    // Iterate to fill the rest
    let lid = 0;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const l = t * length;
        while (lid < dists.length - 2 && dists[lid] < l) {
            lid++;
        }

        if (dists[lid] == l || lid == 0 || lid == line.length - 1) {
            result[i] = line[lid];
        }

        const d_diff = dists[lid + 1] - dists[lid];
        const d_rel = l - dists[lid];
        const tau = d_rel / d_diff;
        const s = 1 - tau;

        result[i] = <P>line[lid].mul(s).add(line[lid + 1].mul(tau));
    }

    return result;
}

export function interpolate_steps<P extends Point>(line: P[], n: number): P[] {
    const results: P[] = new Array(n);
    const u = n - 1;
    for (let i = 0; i <= u; i++) {
        const t = i / u;
        results[i] = interpolate_line(line, t);
    }
    return results;
}

export function interpolate_line<P extends Point>(line: P[], t: number): P {
    const l = t * line.length;
    const l_id = floor(l);

    if (t <= 0) {
        return line[0];
    } else if (t >= 1 || l_id >= line.length - 1) {
        return line[line.length - 1];
    }

    const u = l - l_id;
    const s = 1 - u;
    return <P>line[l_id].mul(s).add(line[l_id + 1].mul(u));
}

// p1 is the flattened point from the top right of the bezier, everything is unrolled from this point, it returns the
//  flattened point arrays of both
export function unroll_beziers(
    a: RationalBezier<Point3D>,
    interval_a: RationalInterval,
    b: RationalBezier<Point3D>,
    interval_b: RationalInterval,
    f2_init: Point2D,
    f2f3_dir: Point2D,
    dir_init: Point2D,
    use_dir_init: boolean
): UnrollResult {
    const num_points = min(
        a.get_min_resolution(interval_a.start, interval_a.end),
        b.get_min_resolution(interval_b.start, interval_b.end)
    );
    const points_b: Point3D[] = b.get_n_in_range(
        num_points,
        interval_b.start,
        interval_b.end
    );
    const points_a: Point3D[] = a.get_n_in_range(
        num_points,
        interval_a.start,
        interval_a.end
    );
    return unroll_internal(
        points_a,
        points_b,
        f2_init,
        f2f3_dir,
        dir_init,
        use_dir_init
    );
}

export function unroll_internal(
    a: Point3D[],
    b: Point3D[],
    f2_init: Point2D,
    f2f3_dir: Point2D,
    dir_init: Point2D,
    use_dir_init: boolean
): UnrollResult {
    let p1 = a[0];
    let p2 = b[0];
    let p3 = b[1];
    let p4 = a[1];
    let d12 = p1.dist(p2);
    let d23 = p2.dist(p3);
    let d13 = p1.dist(p3);
    let d14 = p1.dist(p4);
    let d24 = p2.dist(p4);
    let f2 = f2_init;

    let f3 = Point2D.Zero;
    let f1 = Point2D.Zero;
    let f4 = Point2D.Zero;
    let dira = Point2D.Zero;
    let dirb = Point2D.Zero;

    if (use_dir_init) {
        f1 = f2_init.add(dir_init.mul(d12));
        f3 = flat_third_from_3D(p2, f2, p1, f1, p3, f2f3_dir);
        f4 = flat_third_from_3D(p1, f1, p2, f2, p4, f2f3_dir);
    } else {
        f3 = f2.add(f2f3_dir.mul(d23));
        f1 = flat_third_from_3D(p2, f2, p3, f3, p1, dir_init);
        f4 = flat_third_from_3D(p1, f1, p2, f2, p4, f2f3_dir);
    }

    const a_flat: Point2D[] = new Array(a.length);
    a_flat[0] = f1;
    a_flat[1] = f4;
    const b_flat: Point2D[] = new Array(b.length);
    b_flat[0] = f2;
    b_flat[1] = f3;

    dira = f4.sub(f1);
    dirb = f3.sub(f2);
    p1 = p4;
    p2 = p3;
    f1 = f4;
    f2 = f3;
    for (let i = 2; i < a.length; i++) {
        p3 = b[i];
        p4 = a[i];
        d12 = p1.dist(p2);
        d23 = p2.dist(p3);
        d13 = p1.dist(p3);
        d14 = p1.dist(p4);
        d24 = p2.dist(p4);
        f4 = flat_third_from_3D(p1, f1, p2, f2, p4, dira);
        f3 = flat_third_from_3D(p2, f2, p1, f1, p3, dirb);
        dira = f4.sub(f1);
        dirb = f3.sub(f2);
        a_flat[i] = f4;
        b_flat[i] = f3;
        p1 = p4;
        p2 = p3;
        f1 = f4;
        f2 = f3;
    }

    const f1f4_dir = a_flat[1].sub(a_flat[0]).as_unit();
    const fnfn_less1_dir = a_flat[a_flat.length - 2]
        .sub(a_flat[a_flat.length - 1])
        .as_unit();
    const f2f1_dir = a_flat[0].sub(b_flat[0]).as_unit();
    const f3nf4n_dir = a_flat[a_flat.length - 1]
        .sub(b_flat[b_flat.length - 1])
        .as_unit();

    return {
        a_flat,
        b_flat,
        f1f4_dir,
        fnfn_less1_dir,
        f2f1_dir,
        f3nf4n_dir,
    };
}

export function flat_third_from_3D(
    p0: Point3D,
    f0: Point2D,
    p1: Point3D,
    f1: Point2D,
    p2: Point3D,
    dir: Point2D
): Point2D {
    const vec_01 = p1.sub(p0);
    const vec_02 = p2.sub(p0);
    const a_102 = vec_01.angle(vec_02);
    return get_flat_third(f0, f1, vec_02.magnitude(), a_102, dir).set_dimm(
        p2.w,
        2
    );
}

const tau = pi / 2;
export function get_flat_third(
    f0: Point2D,
    f1: Point2D,
    dist_02: number,
    a_102: number,
    dir: Point2D
): Point2D {
    // Pre calculations
    const k_x = f1.x - f0.x;
    const k_y = f1.y - f0.y;
    const l_k = sqrt(k_x * k_x + k_y * k_y);
    const l_u = dist_02 / l_k;
    const k_clk_x = k_y;
    const k_clk_y = -k_x;
    const cos_a = cos(a_102);
    const cos_1 = cos(a_102 + tau);
    const cos_2 = cos(a_102 - tau);
    const v_1x = k_x * cos_a + k_clk_x * cos_1;
    const v_1y = k_y * cos_a + k_clk_y * cos_1;
    const v_2x = k_x * cos_a + k_clk_x * cos_2;
    const v_2y = k_y * cos_a + k_clk_y * cos_2;
    const dot_1dir = v_1x * dir.x + v_1y * dir.y;
    const dot_2dir = v_2x * dir.x + v_2y * dir.y;

    if (dot_1dir > dot_2dir) {
        return new Point2D(f0.x + l_u * v_1x, f0.y + l_u * v_1y, f0.w);
    } else {
        return new Point2D(f0.x + l_u * v_2x, f0.y + l_u * v_2y, f0.w);
    }
}
