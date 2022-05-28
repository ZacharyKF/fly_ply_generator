import { Point2D } from "./rational_point";
import { floor, pow } from "mathjs";
import { Curve, WrappedCurve } from "./wrapped_curve";

interface CatMulSegment {
    a: Point2D;
    b: Point2D;
    m1: Point2D;
    p1: Point2D;
}

export class CatmullRom extends WrappedCurve<Point2D> {
    split(t_split: number): {
        upper: Curve<Point2D>;
        lower: Curve<Point2D>;
    } {
        let points_upper: Point2D[] = [];
        let points_lower: Point2D[] = [];

        for (let i = 0; i < this.lut.length; i++) {
            let p_upper = this.lut[this.lut.length - i - 1];
            let p_lower = this.lut[i];

            points_upper.push(p_upper.p);
            points_lower.push(p_lower.p);

            if (p_upper.t < t_split && p_lower.t > t_split) {
                break;
            }
        }

        return {
            upper: new CatmullRom(
                points_upper,
                this.alpha,
                this.tension,
                false
            ),
            lower: new CatmullRom(
                points_lower,
                this.alpha,
                this.tension,
                false
            ),
        };
    }

    split_segment(t_lower: number, t_upper: number): Curve<Point2D> {
        let points_segment: Point2D[] = [];

        for (let i = 1; i < this.lut.length; i++) {
            if (this.lut[i].t > t_lower) {
                points_segment.push(this.lut[i - 1].p);
            }

            if (this.lut[i].t > t_upper) {
                points_segment.push(this.lut[i].p);
                points_segment.push(this.lut[i + 1].p);
            }
        }

        return new CatmullRom(points_segment, this.alpha, this.tension, false);
    }

    public segments: CatMulSegment[];
    points: Point2D[];
    alpha: number;
    tension: number;

    constructor(
        points: Point2D[],
        alpha: number,
        tension: number,
        flip_ends: boolean
    ) {
        super();
        this.points = points;
        this.alpha = alpha;
        this.tension = tension;
        if (flip_ends) {
            points.unshift(points[0].add(points[1].sub(points[0])));

            points.push(
                points[points.length - 1].add(
                    points[points.length - 2].sub(points[points.length - 1])
                )
            );
        }

        const s = 1 - tension;
        const segments: CatMulSegment[] = [];
        for (let i = 1; i < points.length - 2; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 2];

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

    get(t: number): Point2D {
        const t_rel = t * this.segments.length;
        const t_idx = floor(t_rel);
        
        if (t_idx <= 0) {
            return this.points[1];
        } else if (t_idx >= this.segments.length) {
            return this.points[this.points.length - 2];
        }
        
        const t_seg = t_rel - t_idx;
        if(t_seg <= 0) {
            return this.segments[t_idx].p1;
        } else if(t_seg >= 1) {
            return this.points[t_idx + 2];
        }
        
        return this.get_segment(this.segments[t_idx], t_seg);
    }

    get_segment(s: CatMulSegment, t: number): Point2D {
        const tt = t * t;
        const ttt = tt * t;
        return s.a.mul(ttt).add(s.b.mul(tt)).add(s.m1.mul(t)).add(s.p1);
    }
}
