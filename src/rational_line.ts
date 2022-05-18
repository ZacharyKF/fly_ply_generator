import { IPath, paths } from "makerjs";
import { RationalPath } from "./rational_path";
import { Point3D } from "./rational_point";

export class RationalLine implements RationalPath {
    a: Point3D;
    b: Point3D;
    vec_ab: Point3D;
    length: number;

    constructor(a: Point3D, b: Point3D) {
        this.a = a;
        this.b = b;
        this.vec_ab = b.sub(a);
        this.length = this.vec_ab.magnitude;
    }

    as_path(dimension: number): IPath {
        return new paths.Line(
            this.a.to_ipoint(dimension),
            this.b.to_ipoint(dimension)
        );
    }

    dist_to_point(point: Point3D): number {
        // First we need the co-vector
        let vec_ap = point.sub(this.a);
        let co_vec = this.vec_ab.co_vec(vec_ap);
        let cop = this.a.add(co_vec);
        let d_acop = cop.dist(this.a);
        let d_bcop = cop.dist(this.b);

        if (d_acop <= this.length && d_bcop <= this.length) {
            // If it's on the line, then return the magnitude of the rejection
            //  vector
            return vec_ap.sub(co_vec).magnitude;
        } else if (d_acop < d_bcop) {
            return point.dist(this.a);
        } else {
            return point.dist(this.b);
        }
    }
}
