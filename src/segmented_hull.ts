import { Bezier, Point } from "bezier-js";
import { IModel, IModelMap, models } from "makerjs";
import { floor, pi } from "mathjs";
import { DrawableHull } from "./boxed_hull_test";
import { flatten_point, point_to_ipoint } from "./makerjs_tools";
import { unroll_point_set } from "./math";
import { Curve } from "./wrapped_curve";

const LEE_COLOR = "blue";
const WIND_COLOR = "purple";

export interface HullSegment {
  dist: number;
  hull_curve: Bezier;
}

export interface HullCurve {
  start_seg_idx: number;
  end_seg_idx: number;
  curve: Curve;
}

export interface FlattenNode {
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
}

export interface DrawPoints {
  lines: Point[];
  starts: Point[];
  ends: Point[];
}

export class SegmentedHull implements DrawableHull {
  lee_segments: HullSegment[];
  wind_segments: HullSegment[];
  lee_curves: HullCurve[];
  wind_curves: HullCurve[];

  constructor(
    lee_segments: HullSegment[],
    wind_segments: HullSegment[],
    lee_curves: HullCurve[],
    wind_curves: HullCurve[]
  ) {
    this.lee_segments = lee_segments;
    this.wind_segments = wind_segments;
    this.lee_curves = lee_curves;
    this.wind_curves = wind_curves;
  }

  draw_main_curves(dimm: number): IModel {
    throw new Error("Method not implemented.");
  }

  bound_segment_with_flatten_node(
    segment: HullSegment,
    node: FlattenNode
  ): Bezier {
    let upper_bound = node.upper_bound(segment.dist);
    let lower_bound = node.lower_bound(segment.dist);
    return segment.hull_curve.split(lower_bound, upper_bound);
  }

  flatten_node_to_points(
    node: FlattenNode,
    draw_arrays: DrawPoints
  ): DrawPoints {
    draw_arrays.lines = draw_arrays.lines.concat(node.upper_nodes);
    draw_arrays.starts.push(node.upper_nodes[0]);
    draw_arrays.ends.push(node.upper_nodes[node.upper_nodes.length - 1]);

    node.children.forEach((child) => {
      this.flatten_node_to_points(child, draw_arrays);
    });

    let reversed_lower = node.lower_nodes.reverse();
    draw_arrays.lines = draw_arrays.lines.concat(reversed_lower);
    draw_arrays.starts.push(reversed_lower[0]);
    draw_arrays.ends.push(reversed_lower[reversed_lower.length - 1]);

    return draw_arrays;
  }

  fill_node(
    node: FlattenNode,
    segments: HullSegment[],
    idx_end: number
  ): {
    ref_dir_upper: number;
    ref_dir_lower: number;
  } {
    let reference = node.reference_point;
    let ref_dir_upper = node.ref_dir_upper;
    let ref_dir_lower = node.ref_dir_lower;
    let prev_seg = segments[node.start_seg_idx];
    let bezier_b = this.bound_segment_with_flatten_node(prev_seg, node);

    for (let i = node.start_seg_idx - 1; i >= idx_end; i--) {
      let segment = segments[i];
      let bezier_a = this.bound_segment_with_flatten_node(segment, node);

      if (node.draw_up) {
        let flattened = unroll_point_set(
          bezier_a.getLUT(),
          bezier_b.getLUT(),
          reference,
          ref_dir_lower,
          false
        );

        node.upper_nodes.push(flattened.a_flat[flattened.a_flat.length - 1]);
        node.lower_nodes.push(flattened.a_flat[0]);

        reference = flattened.a_flat[0];
        ref_dir_lower = flattened.f1f4_dir;
        ref_dir_upper = flattened.fnfn_less1_dir;
      } else if (!node.draw_up) {
        let flattened = unroll_point_set(
          bezier_a.getLUT().reverse(),
          bezier_b.getLUT().reverse(),
          reference,
          ref_dir_upper,
          true
        );

        node.upper_nodes.push(flattened.a_flat[0]);
        node.lower_nodes.push(flattened.a_flat[flattened.a_flat.length - 1]);

        reference = flattened.a_flat[0];
        ref_dir_lower = flattened.fnfn_less1_dir;
        ref_dir_upper = flattened.f1f4_dir;
      }

      prev_seg = segment;
      bezier_b = bezier_a;
    }

    return {
      ref_dir_upper,
      ref_dir_lower,
    };
  }

  draw_flattened_hull(
    draw_lee: boolean,
    draw_wind: boolean
  ): { lee: IModel; wind: IModel } {
    /**
     * We need to build the initial node. The key here is that the segment will be drawn along the line from start to
     *  end. Start is CLOSER TO THE BOW, while end is CLOSER TO THE STERN. End is assumed to be 0, then updated during
     *  the addition of children. It's important to note that draw_start & draw_vec are in a different basis than the
     *  original hull.
     *
     * For consistency, nodes closer to the stern will be drawn TOWARDS THE NEGATIVE X DIRECTION
     */
    let build_initial_node = (segments: HullSegment[]): FlattenNode => {
      return {
        start_seg_idx: segments.length - 1,
        draw_up: false,
        reference_point: { x: 0, y: 0 },
        ref_dir_upper: (3.0 * pi) / 2.0,
        ref_dir_lower: pi / 2.0,
        upper_bound: (dist: number) => 1.0,
        lower_bound: (dist: number) => 0.0,
        children: [],
        upper_nodes: [],
        lower_nodes: [],
      };
    };
    let lee_initial_node = build_initial_node(this.lee_segments);
    let wind_initial_node = build_initial_node(this.wind_segments);

    /**
     * Now for the node insertion, what we do is repetitively take the closest bezier that's within our node's bounds at
     *  their endpoint, create two nodes based on it, remove the parent from the original node list, and add the new
     *  children.
     */
    let populate_nodes = (
      initial_node: FlattenNode,
      segments: HullSegment[],
      curves: HullCurve[]
    ) => {
      // We want to process the curves in order from closes to bow back
      let bezier_sort = (a: HullCurve, b: HullCurve) => {
        return b.end_seg_idx - a.end_seg_idx;
      };
      let sorted_curves = curves.sort(bezier_sort);

      // As we create children, their parents will be removed from here, and the new nodes will get added
      let nodes_to_consider = [initial_node];

      let try_index = 0;
      while (sorted_curves.length > 0) {
        // First try and find an appropriate bezier. If we can't find one there's likely something wrong
        let next_curve = sorted_curves[try_index];
        let bezier_t_end = next_curve.curve.get(1.0);
        let bezier_end_t = bezier_t_end.y;
        let bezier_end_x = bezier_t_end.x;
        let node_index = nodes_to_consider.findIndex((node) => {
          return (
            bezier_end_t < node.upper_bound(bezier_end_x) &&
            bezier_end_t > node.lower_bound(bezier_end_x)
          );
        });

        // If for some reason no overlapping node is found, then we should increment the count. But it's likely that
        //  this is a bug.
        if (node_index < 0) {
          console.error(
            "Failed to find overlapping node for t: " + bezier_end_t
          );
          try_index += 1;
          continue;
        }

        // Ensure the arrays have their elements removed, and reset the index
        sorted_curves.splice(try_index, 1);
        let parent_node = nodes_to_consider.splice(node_index, 1)[0];
        try_index = 0;

        // This may seem counter intuitive, but it's just saying "the parent stops where it meets the curve"
        let new_dirs = this.fill_node(
          parent_node,
          segments,
          next_curve.end_seg_idx + 1
        );

        // With the parent node in hand we need to define our curve bound. This lets us find the curve t value at an
        //  arbitrary point along the hull
        let curve_bound = (dist: number) =>
          next_curve.curve.get_at_dimm_dist(0, dist).y;

        // Keep track of how the direction is flipping, the end of one node is the start of another (until the leaf
        //  nodes, which ACTUALLY end at 0)
        let new_upper: FlattenNode = {
          start_seg_idx: next_curve.end_seg_idx,
          draw_up: false,
          reference_point:
            parent_node.upper_nodes[parent_node.upper_nodes.length - 1],
          ref_dir_upper: new_dirs.ref_dir_upper,
          ref_dir_lower: 0, // Won't actually be used
          upper_bound: parent_node.upper_bound,
          lower_bound: curve_bound,
          children: [],
          upper_nodes: [],
          lower_nodes: [],
        };
        parent_node.children.push(new_upper);
        nodes_to_consider.push(new_upper);

        let new_lower: FlattenNode = {
          start_seg_idx: next_curve.end_seg_idx,
          draw_up: true,
          reference_point:
            parent_node.lower_nodes[parent_node.lower_nodes.length - 1],
          ref_dir_upper: 0, // Won't actually be used
          ref_dir_lower: new_dirs.ref_dir_lower,
          upper_bound: curve_bound,
          lower_bound: parent_node.lower_bound,
          children: [],
          upper_nodes: [],
          lower_nodes: [],
        };
        parent_node.children.push(new_lower);
        nodes_to_consider.push(new_lower);
      }

      nodes_to_consider.forEach((node) => this.fill_node(node, segments, 0));
    };

    populate_nodes(lee_initial_node, this.lee_segments, this.lee_curves);
    populate_nodes(wind_initial_node, this.wind_segments, this.wind_curves);

    // To draw we just need to do a fairly simple recurvive descent, then map the points accordingly
    let lee = this.flatten_node_to_points(lee_initial_node, {
      lines: [],
      starts: [],
      ends: [],
    });
    let wind = this.flatten_node_to_points(wind_initial_node, {
      lines: [],
      starts: [],
      ends: [],
    });

    return {
      lee: {
        layer: LEE_COLOR,
        ...new models.ConnectTheDots(true, lee.lines.map(point_to_ipoint)),
        models: {
          starts: {
            layer: "green",
            ...new models.Holes(0.0625, lee.starts.map(point_to_ipoint)),
          },
          ends: {
            layer: "red",
            ...new models.Holes(0.0625, lee.ends.map(point_to_ipoint)),
          },
        },
      },
      wind: {
        layer: WIND_COLOR,
        ...new models.ConnectTheDots(true, wind.lines.map(point_to_ipoint)),
        models: {
          starts: {
            layer: "green",
            ...new models.Holes(0.0625, wind.starts.map(point_to_ipoint)),
          },
          ends: {
            layer: "red",
            ...new models.Holes(0.0625, wind.ends.map(point_to_ipoint)),
          },
        },
      },
    };
  }

  draw_segments(
    dimm: number,
    number_segs: number,
    draw_lee: boolean,
    draw_wind: boolean
  ): IModel {
    let model_map_lee: IModelMap = {};
    let model_map_wind: IModelMap = {};

    let idx_interval = floor(this.lee_segments.length / number_segs);
    let filter_segment = (_: HullSegment, idx: number): boolean => {
      return idx % idx_interval == 0;
    };

    let segment_to_model = (segment: HullSegment): IModel => {
      let points: Point[] = [];
      for (let i = 0; i < 1.0; i += 0.01) {
        points.push(flatten_point(segment.hull_curve.get(i), dimm));
      }
      return new models.ConnectTheDots(false, points.map(point_to_ipoint));
    };

    let add_to_modelmap = (
      model_map: IModelMap,
      prefix: string
    ): ((model: IModel, idx: number) => void) => {
      return (model: IModel, idx: number) => {
        model_map[prefix + idx] = model;
      };
    };

    if (draw_lee) {
      this.lee_segments
        .filter(filter_segment)
        .map(segment_to_model)
        .forEach(add_to_modelmap(model_map_lee, "lee_hull_curve_"));
    }

    if (draw_wind) {
      this.wind_segments
        .filter(filter_segment)
        .map(segment_to_model)
        .forEach(add_to_modelmap(model_map_wind, "wind_hull_curve_"));
    }

    return {
      models: {
        lee_segments: { layer: LEE_COLOR, models: model_map_lee },
        wind_segments: { layer: WIND_COLOR, models: model_map_wind },
      },
    };
  }

  draw_hull_curves(
    dimm: number,
    draw_lee: boolean,
    draw_wind: boolean
  ): IModel {
    let lee_curves: IModelMap = {};
    let wind_curves: IModelMap = {};

    let map_bezier_onto_segments = (
      segments: HullSegment[],
      hull_curve: HullCurve
    ): IModel => {
      let points_to_draw: Point[] = [];
      for (let i = hull_curve.start_seg_idx; i <= hull_curve.end_seg_idx; i++) {
        let segment = segments[i];
        let t = hull_curve.curve.get_at_dimm_dist(0, segment.dist);
        let point_3d = segment.hull_curve.get(t.y);
        let point_2d = flatten_point(point_3d, dimm);
        points_to_draw.push(point_2d);
      }
      return new models.ConnectTheDots(
        false,
        points_to_draw.map(point_to_ipoint)
      );
    };

    if (draw_lee) {
      this.lee_curves.forEach((curve, idx) => {
        let drawn_curve: IModel = map_bezier_onto_segments(
          this.lee_segments,
          curve
        );
        lee_curves["lee_hull_" + idx] = { layer: "red", ...drawn_curve };
      });
    }

    if (draw_wind) {
      this.wind_curves.forEach((curve, idx) => {
        let drawn_curve: IModel = map_bezier_onto_segments(
          this.wind_segments,
          curve
        );
        wind_curves["wind_hull_" + idx] = { layer: "green", ...drawn_curve };
      });
    }

    return {
      models: {
        lee: { models: lee_curves },
        wind: { models: wind_curves },
      },
    };
  }
}
