import { Point2D } from "../euclidean/rational_point";
import { BoundFn, MeshNode } from "./mesh_node";

export abstract class TriangleNode extends MeshNode {
    constructor(
        reference_point_top: Point2D,
        start_seg_idx: number,
        upper_bound: BoundFn,
        lower_bound: BoundFn,
        private reference_angle: number
    ) {
        super(reference_point_top, start_seg_idx, upper_bound, lower_bound);
    }
}
