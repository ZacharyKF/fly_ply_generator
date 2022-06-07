import { IPath } from "makerjs";
import { Point } from "./rational_point";

export interface RationalPath<P extends Point> {
    readonly length: number;
    dist_to_point: (point: P) => number;
    as_path: (dimension: number) => IPath;
}