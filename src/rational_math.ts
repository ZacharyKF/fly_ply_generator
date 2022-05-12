import { IPoint } from "makerjs";
import { abs, min, sqrt } from "mathjs";
import { Point } from "./rational_point";

// Taken from https://stackoverflow.com/questions/13977354/build-circle-from-3-points-in-3d-space-implementation-in-c-or-c
export function circle_center(a: Point, b: Point, c: Point): Point | undefined {
    // triangle "edges"
    const t = b.sub(a) ;
    const u = c.sub(a);
    const v = c.sub(b);

    // triangle normal
    const w = t.cross(u);
    const wsl = w.magnitude * w.magnitude;
    if (wsl<10e-14) return undefined; // area of the triangle is too small (you may additionally check the points for colinearity if you are paranoid)

    // helpers
    const iwsl2 = 1.0 / (2.0*wsl);
    const tt = t.magnitude * t.magnitude;
    const uu = u.magnitude * u.magnitude;

    // result circle
    const center = a.add(
        u.mul(tt).mul(u.dot(v)).sub(
            t.mul(uu).mul(t.dot(v))
        )
    ).mul(iwsl2);
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
