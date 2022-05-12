import { IPath } from "makerjs";
import { Point } from "./rational_point";

export interface RationalPath {
    length: number;
    dist_to_point: (point: Point) => number;
    as_path: (dimension: number) => IPath;
}