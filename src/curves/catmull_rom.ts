import { floor } from "mathjs";
import { Point2D } from "../euclidean/rational_point";
import { NormalizedCurve } from "./normalized_curve";

interface CatMulSegment {
    a: Point2D;
    b: Point2D;
    m1: Point2D;
    p1: Point2D;
}

export class CatmullRom extends NormalizedCurve<Point2D> {
    public segments: CatMulSegment[];
    controls: Point2D[];
    alpha: number;
    tension: number;

    constructor(
        controls: Point2D[],
        alpha: number,
        tension: number,
        flip_ends: boolean
    ) {
        super(<Point2D>controls[1].zero());
        this.controls = controls;
        this.alpha = alpha;
        this.tension = tension;
        if (flip_ends) {
            controls.unshift(controls[0].add(controls[1].sub(controls[0])));

            controls.push(
                controls[controls.length - 1].add(
                    controls[controls.length - 2].sub(
                        controls[controls.length - 1]
                    )
                )
            );
        }

        const s = 1 - tension;
        const segments: CatMulSegment[] = [];
        for (let i = 1; i < controls.length - 2; i++) {
            const p0 = controls[i - 1];
            const p1 = controls[i];
            const p2 = controls[i + 1];
            const p3 = controls[i + 2];

            const t01 = p0.dist(p1) ** alpha;
            const t12 = p1.dist(p2) ** alpha;
            const t23 = p2.dist(p3) ** alpha;

            const m1 = p2
                .sub(p1)
                .add(
                    p1
                        .sub(p0)
                        .div(t01)
                        .sub(p2.sub(p0).div(t01 + t12))
                        .mul(t12)
                )
                .mul(s);
            // (
            //     p2 - p1 +
            //     (
            //         (p1 - p0) / t01 -
            //         (p2 - p0) / (t01 + t12)
            //     ) * t12
            // ) * (1.0f - tension);
            const m2 = p2
                .sub(p1)
                .add(
                    p3
                        .sub(p2)
                        .div(t23)
                        .sub(p3.sub(p1).div(t12 + t23))
                        .mul(t12)
                )
                .mul(s);
            // (
            //     p2 - p1 +
            //     (
            //         (p3 - p2) / t23 -
            //         (p3 - p1) / (t12 + t23)
            //     ) * t12
            // ) * (1.0f - tension);

            segments.push({
                a: p1.sub(p2).mul(2).add(m1).add(m2),
                b: p1.sub(p2).mul(-3).sub(m1).sub(m1).sub(m2),
                m1,
                p1,
            });
        }

        this.segments = segments;
        this.populate_lut();
    }

    get_internal(t: number): Point2D {
        const t_rel = t * this.segments.length;
        const t_idx = floor(t_rel);

        if (t_idx <= 0) {
            return this.controls[1];
        } else if (t_idx >= this.segments.length) {
            return this.controls[this.controls.length - 2];
        }

        const t_seg = t_rel - t_idx;
        return this.get_segment(this.segments[t_idx], t_seg);
    }

    get_segment(s: CatMulSegment, t: number): Point2D {
        const tt = t * t;
        const ttt = tt * t;
        return s.a.mul(ttt).add(s.b.mul(tt)).add(s.m1.mul(t)).add(s.p1);
    }
}
