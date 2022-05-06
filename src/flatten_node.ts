import { Bezier, Point } from "bezier-js";
import { UnrollResult, unroll_point_set } from "./math";
import { HullSegment } from "./segmented_hull";

export class FlattenNode {
  start_seg_idx: number;
  draw_up: boolean;
  reference_point: Point;
  ref_dir_upper: number;
  ref_dir_lower: number;
  upper_bound: (dist: number) => number;
  lower_bound: (dist: number) => number;
  children: FlattenNode[];
  upper_nodes: Point[];
  lower_nodes: Point[];
  bulkheads: Point[][];

  constructor(
    start_seg_idx: number,
    draw_up: boolean,
    reference_point: Point,
    ref_dir_upper: number,
    ref_dir_lower: number,
    upper_bound: (dist: number) => number,
    lower_bound: (dist: number) => number
  ) {
    this.start_seg_idx = start_seg_idx;
    this.draw_up = draw_up;
    this.reference_point = reference_point;
    this.ref_dir_upper = ref_dir_upper;
    this.ref_dir_lower = ref_dir_lower;
    this.upper_bound = upper_bound;
    this.lower_bound = lower_bound;
    this.children = [];
    this.upper_nodes = [];
    this.lower_nodes = [];
    this.bulkheads = [];
  }

  as_list(): FlattenNode[] {
    let nodes: FlattenNode[] = [this];
    this.children.forEach((child) => {
      nodes.push(...child.as_list());
    });
    return nodes;
  }

  to_continuous_points(points: Point[]): Point[] {
    points.push(...this.upper_nodes);

    this.children.forEach((child) => {
      child.to_continuous_points(points);
    });

    points.push(...this.lower_nodes.reverse());

    return points;
  }

  bound_segment_with_flatten_node(segment: HullSegment): Bezier {
    let upper_bound = this.upper_bound(segment.dist);
    let lower_bound = this.lower_bound(segment.dist);
    return segment.hull_curve.split(lower_bound, upper_bound);
  }

  append_segment(points: Point[], seg_idx: number, bulkheads: Set<number>) {
    if (!this.draw_up) {
        points = points.reverse();
    }

    this.upper_nodes.push(points[points.length - 1]);
    this.lower_nodes.push(points[0]);

    if (bulkheads.has(seg_idx)) {
        this.bulkheads.push(points);
    }
  }

  fill(
    segments: HullSegment[],
    idx_end: number,
    bulkheads: Set<number>
  ): {
    ref_dir_upper: number;
    ref_dir_lower: number;
  } {
    let reference = this.reference_point;
    let ref_dir_upper = this.ref_dir_upper;
    let ref_dir_lower = this.ref_dir_lower;
    let prev_seg = segments[this.start_seg_idx];
    let bezier_b = this.bound_segment_with_flatten_node(prev_seg);

    for (let i = this.start_seg_idx - 1; i >= idx_end; i--) {
      let segment = segments[i];
      let bezier_a = this.bound_segment_with_flatten_node(segment);

      let flattened = unroll_point_set(
        bezier_a.getLUT(),
        bezier_b.getLUT(),
        !this.draw_up,
        reference,
        !this.draw_up ? ref_dir_upper : ref_dir_lower,
        !this.draw_up
      );

      reference = flattened.a_flat[0];

      if (i == this.start_seg_idx - 1) {
        this.append_segment(flattened.b_flat, this.start_seg_idx, bulkheads);
      }

      this.append_segment(flattened.a_flat, i, bulkheads);

      if (!this.draw_up) {
        ref_dir_lower = flattened.fnfn_less1_dir;
        ref_dir_upper = flattened.f1f4_dir;
      } else {
        ref_dir_lower = flattened.f1f4_dir;
        ref_dir_upper = flattened.fnfn_less1_dir;
      }

      prev_seg = segment;
      bezier_b = bezier_a;
    }

    return {
      ref_dir_upper,
      ref_dir_lower,
    };
  }
}
