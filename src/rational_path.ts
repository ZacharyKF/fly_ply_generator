import { IPath } from "makerjs";
import { Point3D } from "./rational_point";

export interface RationalPath {
    length: number;
    dist_to_point: (point: Point3D) => number;
    as_path: (dimension: number) => IPath;
}