import { Point2D } from "../euclidean/rational_point";
import { BoundFn, MeshNode } from "./mesh_node";

export class SquareNode extends MeshNode {
    constructor(
        reference_point_top: Point2D,
        start_seg_idx: number,
        upper_bound: BoundFn,
        lower_bound: BoundFn,
        private reference_point_bottom: Point2D
    ) {
        super(reference_point_top, start_seg_idx, upper_bound, lower_bound);
    }
}
