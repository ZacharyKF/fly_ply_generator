import { Bezier, Point } from "bezier-js";
import { IModel, IModelMap, model, models, paths } from "makerjs";
import { points_to_imodel, point_path_to_puzzle_teeth, point_to_ipoint } from "./makerjs_tools";
import {
  center_of_endpoints,
  middle_value,
  point_add,
  point_mul,
  UnrollResult,
  unroll_point_set,
  unroll_unflat_flat,
} from "./math";
import { HullSegment } from "./segmented_hull";

export class FlattenNode {
  prefix: string;
  depth: number;
  idx: number;
  start_seg_idx: number;
  draw_up: boolean;
  reference_point: Point;
  ref_dir_upper: number;
  ref_dir_lower: number;
  upper_bound: (dist: number) => number;
  lower_bound: (dist: number) => number;
  children: FlattenNode[];
  start: Point[];
  upper_nodes: Point[];
  lower_nodes: Point[];
  bulkheads: Point[][];

  constructor(
    prefix: string,
    depth: number,
    idx: number,
    start_seg_idx: number,
    draw_up: boolean,
    reference_point: Point,
    ref_dir_upper: number,
    ref_dir_lower: number,
    upper_bound: (dist: number) => number,
    lower_bound: (dist: number) => number,
  ) {
    this.prefix = prefix;
    this.depth = depth;
    this.idx = idx;
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
    this.start = [];
  }

  draw_node(): IModel {
    let to_draw: Point[] = [...this.upper_nodes];

    this.children.forEach((child) => {
      if (!child.draw_up) {
        to_draw.push(...child.start);
      } else {
        to_draw.push(...[...child.start].reverse());
      }
    })

    to_draw.push(...[...this.lower_nodes].reverse());

    if (this.draw_up) {
      to_draw.push(...this.start);
    } else {
      to_draw.push(...[...this.start].reverse());
    }

    let bulkheads: IModelMap = {};
    this.bulkheads.forEach((bulkhead, idx) => {
      let model = points_to_imodel(false, bulkhead);
      model.layer = "blue";
      bulkheads["bulkhead_" + idx] = model;
    });

    let box: IModel = {
      ...points_to_imodel(false, to_draw),
      models: bulkheads,
    };

    let caption_point = point_to_ipoint(
      center_of_endpoints([
        middle_value(this.upper_nodes),
        middle_value(this.lower_nodes),
      ])
    );

    model.addCaption(
      box,
      this.prefix + ", " + this.depth + ", " + this.idx,
      caption_point,
      caption_point
    );

    return box;
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
    this.upper_nodes.push(points[!this.draw_up ? 0 : points.length - 1]);
    this.lower_nodes.push(points[!this.draw_up ? points.length - 1 : 0]);

    if (bulkheads.has(seg_idx)) {
      this.bulkheads.push(points);
    }
  }

  fill(
    segments: HullSegment[],
    idx_end: number,
    puzzle_tooth_width: number,
    puzzle_tooth_angle: number,
    bulkheads: Set<number>
  ): FillResult {
    let bezier_b = this.bound_segment_with_flatten_node(
      segments[this.start_seg_idx]
    );
    let bezier_a = this.bound_segment_with_flatten_node(
      segments[this.start_seg_idx - 1]
    );

    let flattened = unroll_point_set(
      bezier_a.getLUT(),
      bezier_b.getLUT(),
      !this.draw_up,
      this.reference_point,
      !this.draw_up ? this.ref_dir_upper : this.ref_dir_lower,
      !this.draw_up
    );

    this.start = point_path_to_puzzle_teeth(flattened.b_flat, puzzle_tooth_width, puzzle_tooth_angle);

    this.append_segment(flattened.b_flat, this.start_seg_idx, bulkheads);
    this.append_segment(flattened.a_flat, this.start_seg_idx - 1, bulkheads);

    bezier_b = bezier_a;

    for (let i = this.start_seg_idx - 2; i >= idx_end; i--) {
      bezier_a = this.bound_segment_with_flatten_node(segments[i]);

      flattened = unroll_unflat_flat(
        bezier_a.getLUT(),
        bezier_b.getLUT(),
        flattened.a_flat,
        !this.draw_up,
        !this.draw_up
      );

      this.append_segment(flattened.a_flat, i, bulkheads);

      bezier_b = bezier_a;
    }

    return {
      ref_dir_upper: !this.draw_up
        ? flattened.f1f4_dir
        : flattened.fnfn_less1_dir,
      ref_dir_lower: !this.draw_up
        ? flattened.fnfn_less1_dir
        : flattened.f1f4_dir,
    };
  }
}

interface FillResult {
  ref_dir_upper: number;
  ref_dir_lower: number;
}
