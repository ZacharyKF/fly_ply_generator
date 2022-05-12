import { IPoint } from "makerjs";
import { abs, acos, max, min, sqrt } from "mathjs";

export class Point {
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

    add(other: Point): Point {
        return new Point(
            this.x + other.x,
            this.y + other.y,
            this.z + other.z,
            this.w + other.w
        );
    }

    sub(other: Point): Point {
        return new Point(
            this.x - other.x,
            this.y - other.y,
            this.z - other.z,
            this.w - other.w
        );
    }

    dist(other: Point) : number {
        return this.sub(other).magnitude;
    }

    mul(n: number): Point {
        return new Point(this.x * n, this.y * n, this.z * n, this.w * n);
    }

    div(n: number): Point {
        return this.mul(1 / n);
    }

    diff_dimm(other: Point, dimm: number): number {
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

    set_dimm(n: number, dimm: number): Point {
        switch (dimm) {
            case 3:
                return new Point(this.x, this.y, this.z, n);
            case 2:
                return new Point(this.x, this.y, n, this.w);
            case 1:
                return new Point(this.x, n, this.z, this.w);
            default:
                return new Point(n, this.y, this.z, this.w);
        }
    }

    mul_dimm(n: number, dimm: number): Point {
        switch (dimm) {
            case 3:
                return new Point(this.x, this.y, this.z, this.w * n);
            case 2:
                return new Point(this.x, this.y, this.z * n, this.w);
            case 1:
                return new Point(this.x, this.y * n, this.z, this.w);
            default:
                return new Point(this.x * n, this.y, this.z, this.w);
        }
    }

    div_dimm(n: number, dimm: number) {
        return this.mul_dimm(1 / n, dimm);
    }

    co_vec(other: Point): Point {
        return other.mul(this.dot(other)/(other.magnitude * other.magnitude));
    }

    rej_vec(other: Point) : Point {
        return other.sub(this.co_vec(other));
    }

    dot(other: Point): number {
        let dot = (
            (this.x * other.x + this.y * other.y + this.z * other.z) /
            (this.magnitude * other.magnitude)
        );
        if (dot > 1) {
            return 1;
        } else if (dot < -1) {
            return -1;
        } else {
            return dot;
        }
    }

    cross(other: Point): Point {
        return new Point(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x,
            0,
        );
    }

    angle(other: Point) : number {
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

    area(other: Point, height_dimm: number, width_dimm: number): number {
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

