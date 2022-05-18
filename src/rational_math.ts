import { IPoint } from "makerjs";
import { abs, floor, min, sqrt } from "mathjs";
import { RationalBezier } from "./rational_bezier";
import { Point2D, Point3D } from "./rational_point";

// Taken from https://stackoverflow.com/questions/13977354/build-circle-from-3-points-in-3d-space-implementation-in-c-or-c
export function circle_center(
    a: Point3D,
    b: Point3D,
    c: Point3D
): Point3D | undefined {
    // triangle "edges"
    const t = b.sub(a);
    const u = c.sub(a);
    const v = c.sub(b);

    // triangle normal
    const w = t.cross(u);
    const wsl = w.magnitude * w.magnitude;
    if (wsl < 10e-14) return undefined; // area of the triangle is too small (you may additionally check the points for colinearity if you are paranoid)

    // helpers
    const iwsl2 = 1.0 / (2.0 * wsl);
    const tt = t.magnitude * t.magnitude;
    const uu = u.magnitude * u.magnitude;

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
    return center;
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
    f1f4_dir: number;
    fnfn_less1_dir: number;
}

const FLATTEN_RESOLUTION = 100;

// p1 is the flattened point from the top right of the bezier, everything is unrolled from this point, it returns the
//  flattened point arrays of both
export function unroll_point_set(
    a: RationalBezier,
    b: RationalBezier,
    reverse_points: boolean,
    f2_init: Point2D,
    f2f3_ang: number,
    clockwise: boolean
): UnrollResult {
    /**
     * CLOCKWISE
     * a    b
     * 1    2
     *
     * 4    3
     *
     * - f2f3_ang refers to the initial direction of f2 -> f3
     * - clockwise refers to the rotational direction between f2f3_ang & vf2f1, the case above is the true case
     *
     * The return reference dir is the direction between f1 & f4 of the first quad
     *
     * COUNTER-CLOCKWISE
     *
     * 4    3
     *
     * 1    2
     * a    b
     */

    let start_i = 0;
    let inc_i = 1 / FLATTEN_RESOLUTION;

    if (reverse_points) {
        start_i = 1;
        inc_i = -inc_i;
    }

    // Our arrays to populate
    let a_flat: Point2D[] = [];
    let b_flat: Point2D[] = [];

    // Initial points
    let p1 = a.get(start_i);
    let p2 = b.get(start_i);

    // Calculate f2, this is a pretty similar operation to the loop body
    let f2 = f2_init;
    let f1 = Point2D.Zero;
    {
        let p3 = b.get(start_i + inc_i);
        let t2 = p3.sub(p2).angle(p1.sub(p2));
        let d12 = p1.dist(p2);

        if (clockwise) {
            f1 = f2.flat_rotation(0, d12, f2f3_ang - t2);
        } else {
            f1 = f2.flat_rotation(0, d12, f2f3_ang + t2);
        }
    }

    a_flat.push(f1);
    b_flat.push(f2);

    for (let i = start_i + inc_i; i <= 1 && i >= 0; i += inc_i) {
        let p4 = a.get(i);
        let p3 = b.get(i);

        let txf1 = f1.axis_angle(0, f2);
        let txf2 = f2.axis_angle(0, f1);

        let t1 = p2.sub(p1).angle(p4.sub(p1));
        let t2 = p3.sub(p2).angle(p1.sub(p2));

        let d14 = p1.dist(p4);
        let d23 = p2.dist(p3);

        if (clockwise) {
            f1 = f1.flat_rotation(0, d14, txf1 - t1);
            f2 = f2.flat_rotation(0, d23, txf2 + t2);
        } else {
            f1 = f1.flat_rotation(0, d14, txf1 + t1);
            f2 = f2.flat_rotation(0, d23, txf2 - t2);
        }

        a_flat.push(f1);
        b_flat.push(f2);

        p1 = p4;
        p2 = p3;
    }

    let f1f4_dir = a_flat[0].axis_angle(0, a_flat[1]);
    let fnfn_less1_dir = a_flat[a_flat.length - 1].axis_angle(
        0,
        a_flat[a_flat.length - 2]
    );

    return {
        a_flat,
        b_flat,
        f1f4_dir,
        fnfn_less1_dir,
    };
}

export function unroll_unflat_flat(
    a: RationalBezier,
    b: RationalBezier,
    b_flat: Point2D[],
    reverse_points: boolean,
    clockwise: boolean
): UnrollResult {
    /**
     * CLOCKWISE
     * a    b
     * 1    2
     *
     * 4    3
     *
     * - f2f3_ang refers to the initial direction of f2 -> f3
     * - clockwise refers to the rotational direction between f2f3_ang & vf2f1, the case above is the true case
     *
     * The return reference dir is the direction between f1 & f4 of the first quad
     *
     * COUNTER-CLOCKWISE
     *
     * 4    3
     *
     * 1    2
     * a    b
     */

    let start_i = 0;
    let inc_i = 1 / FLATTEN_RESOLUTION;

    if (reverse_points) {
        start_i = 1.0;
        inc_i = -inc_i;
    }

    // Our arrays to populate
    let a_flat: Point2D[] = [];

    // Our
    // Initial points
    let p1 = a.get(start_i);
    let p2 = b.get(start_i);

    // Calculate f2, this is a pretty similar operation to the loop body
    let f2 = b_flat[0];
    let f2f3_ang = f2.axis_angle(0, b_flat[1]);
    let f1 = Point2D.Zero;
    {
        let p3 = b.get(start_i + inc_i);
        let t2 = p3.sub(p2).angle(p1.sub(p2));
        let d12 = p1.dist(p2);

        if (clockwise) {
            f1 = f2.flat_rotation(2, f2f3_ang - t2, d12);
        } else {
            f1 = f2.flat_rotation(2, f2f3_ang + t2, d12);
        }
    }

    a_flat.push(f1);

    for (let i = start_i + inc_i; i >= 0 && i <= 1; i += inc_i) {
        let p4 = a.get(i);
        let p3 = b.get(i);

        let txf1 = f1.axis_angle(0, f2);
        let txf2 = f2.axis_angle(0, f1);

        let v_12 = p2.sub(p1);
        let v_14 = p4.sub(p1);
        let t1 = v_12.angle(v_14);

        let v_21 = p1.sub(p2);
        let v_23 = p3.sub(p2);
        let t2 = v_21.angle(v_23);

        let d14 = p1.dist(p4);
        let d23 = p2.dist(p3);

        if (clockwise) {
            f1 = f1.flat_rotation(2, txf1 - t1, d14);
            f2 = f2.flat_rotation(2, txf2 + t2, d23);
        } else {
            f1 = f1.flat_rotation(2, txf1 + t1, d14);
            f2 = f2.flat_rotation(2, txf2 - t2, d23);
        }

        a_flat.push(f1);

        p1 = p4;
        p2 = p3;
    }

    let f1f4_dir = a_flat[0].axis_angle(2, a_flat[1]);
    let fnfn_less1_dir = a_flat[a_flat.length - 1].axis_angle(
        2,
        a_flat[a_flat.length - 2]
    );

    return {
        a_flat,
        b_flat,
        f1f4_dir,
        fnfn_less1_dir,
    };
}

export function middle_value<T>(arr: T[]): T {
    return arr[floor(arr.length / 2)];
}
