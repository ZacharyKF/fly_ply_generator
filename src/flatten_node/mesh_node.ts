import { Point2D } from "../euclidean/rational_point";

export type BoundFn = (dist: number) => number;

export abstract class MeshNode {
    // Empty from start
    children: MeshNode[] = [];
    start: Point2D[] = [];
    upper_nodes: Point2D[] = [];
    lower_nodes: Point2D[] = [];
    bulkheads: Point2D[][] = [];

    constructor(
        private reference_point_top: Point2D,
        private start_seg_idx: number,
        private upper_bound: BoundFn,
        private lower_bound: BoundFn
    ) {}
}
