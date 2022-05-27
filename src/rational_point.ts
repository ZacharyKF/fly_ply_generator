import { IPoint } from "makerjs";
import { abs, acos, cos, max, min, sin, sqrt } from "mathjs";

export interface Point {
    magnitude: number;
    x: number;
    y: number;
    w: number;

    dimm_dist_f(dimm: number, dist: number): number;
    zero(): Point;
    cross_mag(other: Point): number;
    add(other: Point): Point;
    sub(other: Point): Point;
    dist(other: Point): number;
    mul(n: number): Point;
    div(n: number): Point;
    diff_dimm(other: Point, dimm: number): number;
    set_dimm(n: number, dimm: number): Point;
    mul_dimm(n: number, dimm: number): Point;
    div_dimm(n: number, dimm: number): Point;
    co_vec(other: Point): Point;
    rej_vec(other: Point): Point;
    dot(other: Point): number;
    angle(other: Point): number;
    to_ipoint(dimm: number): IPoint;
    as_unit(): Point;
    get_axis(dimm: number): Point;
    axis_angle(dimm: number, other: Point): number;
    flat_rotation(dimm: number, radius: number, angle: number): Point;
    area(other: Point, height_dimm: number, width_dimm: number): number;
}

export class Point3D implements Point {
    static Zero = new Point3D(0, 0, 0, 1);
    static X = new Point3D(1, 0, 0, 1);
    static Y = new Point3D(0, 1, 0, 1);
    static Z = new Point3D(0, 0, 1, 1);

    x: number;
    y: number;
    z: number;
    w: number;
    magnitude: number;

    constructor(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        this.magnitude = sqrt(x * x + y * y + z * z);
    }

    dimm_dist_f(dimm: number, dist: number): number {
        switch (dimm) {
            case 2:
                return this.z - dist;
            case 1:
                return this.y - dist;
            default:
                return this.x - dist;
        }
    }

    zero(): Point3D {
        return Point3D.Zero;
    }

    cross_mag(other: Point3D): number {
        return this.cross(other).magnitude;
    }

    add(other: Point3D): Point3D {
        return new Point3D(
            this.x + other.x,
            this.y + other.y,
            this.z + other.z,
            this.w + other.w
        );
    }

    sub(other: Point3D): Point3D {
        return new Point3D(
            this.x - other.x,
            this.y - other.y,
            this.z - other.z,
            this.w - other.w
        );
    }

    dist(other: Point3D): number {
        return this.sub(other).magnitude;
    }

    mul(n: number): Point3D {
        return new Point3D(this.x * n, this.y * n, this.z * n, this.w * n);
    }

    div(n: number): Point3D {
        return this.mul(1 / n);
    }

    diff_dimm(other: Point3D, dimm: number): number {
        switch (dimm) {
            case 3:
                return this.w - other.w;
            case 2:
                return this.z - other.z;
            case 1:
                return this.y - other.y;
            default:
                return this.x - other.x;
        }
    }

    set_dimm(n: number, dimm: number): Point3D {
        switch (dimm) {
            case 3:
                return new Point3D(this.x, this.y, this.z, n);
            case 2:
                return new Point3D(this.x, this.y, n, this.w);
            case 1:
                return new Point3D(this.x, n, this.z, this.w);
            default:
                return new Point3D(n, this.y, this.z, this.w);
        }
    }

    mul_dimm(n: number, dimm: number): Point3D {
        switch (dimm) {
            case 3:
                return new Point3D(this.x, this.y, this.z, this.w * n);
            case 2:
                return new Point3D(this.x, this.y, this.z * n, this.w);
            case 1:
                return new Point3D(this.x, this.y * n, this.z, this.w);
            default:
                return new Point3D(this.x * n, this.y, this.z, this.w);
        }
    }

    div_dimm(n: number, dimm: number): Point3D {
        return this.mul_dimm(1 / n, dimm);
    }

    co_vec(other: Point3D): Point3D {
        return other.mul(this.dot(other) / (other.magnitude * other.magnitude));
    }

    rej_vec(other: Point3D): Point3D {
        return other.sub(this.co_vec(other));
    }

    dot(other: Point3D): number {
        let dot =
            (this.x * other.x + this.y * other.y + this.z * other.z) /
            (this.magnitude * other.magnitude);
        if (dot >= 1) {
            return 1;
        } else if (dot <= -1) {
            return -1;
        } else {
            return dot;
        }
    }

    cross(other: Point3D): Point3D {
        return new Point3D(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x,
            0
        );
    }

    angle(other: Point3D): number {
        return acos(this.dot(other));
    }

    to_ipoint(dimm: number): IPoint {
        switch (dimm) {
            case 2:
                return [this.x, this.y];
            case 1:
                return [this.x, this.z];
            default:
                return [this.y, this.z];
        }
    }

    as_unit(): Point3D {
        return this.div(this.magnitude);
    }

    get_axis(dimm: number): Point3D {
        switch (dimm) {
            case 2:
                return Point3D.Z;
            case 1:
                return Point3D.Y;
            default:
                return Point3D.X;
        }
    }

    axis_angle(dimm: number, other: Point3D): number {
        let axis = this.get_axis(dimm);
        let this_other = other.sub(this);
        let cross = this_other.cross(axis);
        let angle = this_other.angle(axis);

        return angle;
    }

    flat_rotation(dimm: number, radius: number, angle: number): Point3D {
        switch (dimm) {
            case 2:
                return new Point3D(
                    this.x + radius * cos(angle),
                    this.y + radius * sin(angle),
                    0,
                    0
                );
            case 1:
                return new Point3D(
                    this.x + radius * cos(angle),
                    this.z + radius * sin(angle),
                    0,
                    0
                );
            default:
                return new Point3D(
                    this.y + radius * cos(angle),
                    this.z + radius * sin(angle),
                    0,
                    0
                );
        }
    }

    area(other: Point3D, height_dimm: number, width_dimm: number): number {
        let diff = this.sub(other);
        let height = 0;
        switch (height_dimm) {
            case 2:
                height = diff.z;
                break;
            case 1:
                height = diff.y;
                break;
            default:
                height = diff.x;
        }
        switch (width_dimm) {
            case 2:
                return abs(height * (min(this.z, other.z) + diff.z / 2));
            case 1:
                return abs(height * (min(this.y, other.y) + diff.y / 2));
            default:
                return abs(height * (min(this.x, other.x) + diff.x / 2));
        }
    }
}

export class Point2D implements Point {
    static Zero = new Point2D(0, 0, 1);
    static X = new Point2D(1, 0, 1);
    static Y = new Point2D(0, 1, 1);

    x: number;
    y: number;
    w: number;
    magnitude: number;

    constructor(x: number, y: number, w: number) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.magnitude = sqrt(x * x + y * y);
    }

    dimm_dist_f(dimm: number, dist: number): number {
        switch (dimm) {
            case 1:
                return this.y - dist;
            default:
                return this.x - dist;
        }
    }


    zero(): Point {
        return Point2D.Zero;
    }

    cross_mag(other: Point2D): number {
        return this.cross(other);
    }

    add(other: Point2D): Point2D {
        return new Point2D(
            this.x + other.x,
            this.y + other.y,
            this.w + other.w
        );
    }

    sub(other: Point2D): Point2D {
        return new Point2D(
            this.x - other.x,
            this.y - other.y,
            this.w - other.w
        );
    }

    dist(other: Point2D): number {
        return this.sub(other).magnitude;
    }

    mul(n: number): Point2D {
        return new Point2D(this.x * n, this.y * n, this.w * n);
    }

    div(n: number): Point2D {
        return this.mul(1 / n);
    }

    diff_dimm(other: Point2D, dimm: number): number {
        switch (dimm) {
            case 2:
                return this.w - other.w;
            case 1:
                return this.y - other.y;
            default:
                return this.x - other.x;
        }
    }

    set_dimm(n: number, dimm: number): Point2D {
        switch (dimm) {
            case 2:
                return new Point2D(this.x, this.y, n);
            case 1:
                return new Point2D(this.x, n, this.w);
            default:
                return new Point2D(n, this.y, this.w);
        }
    }

    mul_dimm(n: number, dimm: number): Point2D {
        switch (dimm) {
            case 2:
                return new Point2D(this.x, this.y, this.w * n);
            case 1:
                return new Point2D(this.x, this.y * n, this.w);
            default:
                return new Point2D(this.x * n, this.y, this.w);
        }
    }

    div_dimm(n: number, dimm: number): Point2D {
        return this.mul_dimm(1 / n, dimm);
    }

    co_vec(other: Point2D): Point2D {
        return other.mul(this.dot(other) / (other.magnitude * other.magnitude));
    }

    rej_vec(other: Point2D): Point2D {
        return other.sub(this.co_vec(other));
    }

    dot(other: Point2D): number {
        let dot =
            (this.x * other.x + this.y * other.y) /
            (this.magnitude * other.magnitude);
        if (dot >= 1) {
            return 1;
        } else if (dot <= -1) {
            return -1;
        } else {
            return dot;
        }
    }

    cross(other: Point2D): number {
        return this.x * other.y - this.y * other.x;
    }

    angle(other: Point2D): number {
        return acos(this.dot(other));
    }

    to_ipoint(dimm: number): IPoint {
        return [this.x, this.y];
    }

    as_unit(): Point2D {
        return this.div(this.magnitude);
    }

    get_axis(dimm: number): Point2D {
        switch (dimm) {
            case 1:
                return Point2D.Y;
            default:
                return Point2D.X;
        }
    }

    // There is only one axis, so we can use the circle angle
    axis_angle(dimm: number, other: Point2D): number {
        return Math.atan2(other.y - this.y, other.x - this.x);
    }

    flat_rotation(dimm: number, radius: number, angle: number): Point2D {
        return new Point2D(
            this.x + radius * cos(angle),
            this.y + radius * sin(angle),
            1
        );
    }

    area(other: Point2D, height_dimm: number, width_dimm: number): number {
        let diff = this.sub(other);
        let height = 0;
        switch (height_dimm) {
            case 1:
                height = diff.y;
                break;
            default:
                height = diff.x;
        }
        switch (width_dimm) {
            case 1:
                return abs(height * (min(this.y, other.y) + diff.y / 2));
            default:
                return abs(height * (min(this.x, other.x) + diff.x / 2));
        }
    }
}
