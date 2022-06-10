import { IPath, paths } from "makerjs";
import { abs, pi } from "mathjs";
import { RationalPath } from "./rational_path";
import { Point } from "./rational_point";

const tau = 2 * pi;
export class RationalArc<P extends Point> implements RationalPath<P> {
    readonly vec_a: P;
    readonly vec_b: P;
    readonly vec_c: P;
    readonly angle: number;
    readonly length: number;

    constructor(
        readonly center: P,
        readonly a: P,
        readonly b: P,
        readonly c: P,
        readonly radius: number
    ) {
        this.vec_a = <P>a.sub(center);
        this.vec_b = <P>b.sub(center);
        this.vec_c = <P>c.sub(center);
        this.angle = this.vec_a.angle(this.vec_c);
        this.length = tau * radius * (this.angle / tau);
    }

    as_path(dimension: number): IPath {
        let vec_flat_ba = this.a.sub(this.b).set_dimm(0, dimension);
        let vec_flat_bc = this.c.sub(this.b).set_dimm(0, dimension);

        // Simple check to stop us from trying to draw an arc that doesn't exist
        //  in the plane we're projecting to
        if (abs(vec_flat_ba.dot(vec_flat_bc)) > 0.9999999) {
            return new paths.Line(
                this.a.to_ipoint(dimension),
                this.c.to_ipoint(dimension)
            );
        } else {
            return new paths.Arc(
                this.a.to_ipoint(dimension),
                this.b.to_ipoint(dimension),
                this.c.to_ipoint(dimension)
            );
        }
    }

    dist_to_point(point: P): number {
        // Two cases, one if it's inside our arc, one if it's outside
        let vec_p = point.sub(this.center);
        let angle_pa = vec_p.angle(this.vec_a);
        let angle_pb = vec_p.angle(this.vec_c);

        let inside = angle_pa <= this.angle && angle_pb <= this.angle;

        if (inside) {
            // If it's angle to each vector is less than the total angle, it's
            //  in bounds and we can take it's absolute distance from the radius
            return abs(this.radius - point.dist(this.center));
        } else if (angle_pa < angle_pb) {
            return point.dist(this.a);
        } else {
            return point.dist(this.b);
        }
    }
}
