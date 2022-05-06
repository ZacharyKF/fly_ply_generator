import { Bezier, Point } from "bezier-js";
import { IModel, IModelMap } from "makerjs";
import { abs, floor, pi } from "mathjs";
import { DrawableHull } from "./boxed_hull_test";
import { FlattenNode } from "./flatten_node";
import { flatten_point, points_to_imodel } from "./makerjs_tools";
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

  closest_segments(dist: number): number {
    let closest = this.lee_segments.reduce(
      ({ idx, d }, new_seg, new_idx) => {
        let new_d = abs(new_seg.dist - dist);
        if (new_d < d) {
          return {
            idx: new_idx,
            d: new_d,
          };
        }
        return { idx, d };
      },
      { idx: 0, d: abs(this.lee_segments[0].dist - dist) }
    );

    return closest.idx;
  }

  draw_bulkhead(dist: number): IModel {
    let closest_seg = this.closest_segments(dist);
    let points: Point[] = this.wind_segments[closest_seg].hull_curve
      .getLUT()
      .reverse()
      .concat(this.lee_segments[closest_seg].hull_curve.getLUT());
    return points_to_imodel(
      true,
      points.map((p) => flatten_point(p, 0))
    );
  }

  draw_main_curves(dimm: number): IModel {
    throw new Error("Method not implemented.");
  }

  draw_flattened_hull(
    draw_lee: boolean,
    draw_wind: boolean,
    bulkheads: number[]
  ): { lee: IModel; wind: IModel } {
    /**
     * We need a set of segments to use for generating bulkheads
     */
    let bulk_head_segs: Set<number> = new Set();
    bulkheads.forEach((d) => {
      bulk_head_segs.add(this.closest_segments(d));
    });

    /**
     * We need to build the initial node. The key here is that the segment will be drawn along the line from start to
     *  end. Start is CLOSER TO THE BOW, while end is CLOSER TO THE STERN. End is assumed to be 0, then updated during
     *  the addition of children. It's important to note that draw_start & draw_vec are in a different basis than the
     *  original hull.
     *
     * For consistency, nodes closer to the stern will be drawn TOWARDS THE NEGATIVE X DIRECTION
     */
    let build_initial_node = (prefix: string, segments: HullSegment[]): FlattenNode => {
      return new FlattenNode(
        prefix,
        0,
        0,
        segments.length - 1,
        false,
        { x: 0, y: 0 },
        (3.0 * pi) / 2.0,
        pi / 2.0,
        (_) => 1.0,
        (_) => 0.0,
      );
    };

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
        let new_dirs = parent_node.fill(
          segments,
          next_curve.end_seg_idx,
          bezier_end_t,
          bulk_head_segs
        );

        // With the parent node in hand we need to define our curve bound. This lets us find the curve t value at an
        //  arbitrary point along the hull
        let curve_bound = (dist: number) =>
          next_curve.curve.get_at_dimm_dist(0, dist).y;

        // Keep track of how the direction is flipping, the end of one node is the start of another (until the leaf
        //  nodes, which ACTUALLY end at 0)
        let new_upper = new FlattenNode(
          parent_node.prefix,
          parent_node.depth + 1,
          parent_node.children.length,
          next_curve.end_seg_idx,
          false,
          parent_node.upper_nodes[parent_node.upper_nodes.length - 1],
          new_dirs.ref_dir_upper,
          0, // Won't actually be used
          parent_node.upper_bound,
          curve_bound,
        );
        parent_node.children.push(new_upper);
        nodes_to_consider.push(new_upper);

        let new_lower = new FlattenNode(
          parent_node.prefix,
          parent_node.depth + 1,
          parent_node.children.length,
          next_curve.end_seg_idx,
          true,
          parent_node.lower_nodes[parent_node.lower_nodes.length - 1],
          0, // Won't actually be used
          new_dirs.ref_dir_lower,
          curve_bound,
          parent_node.lower_bound,
        );
        parent_node.children.push(new_lower);
        nodes_to_consider.push(new_lower);
      }

      nodes_to_consider.forEach((node) => {
        node.fill(segments, 0, 5.0, bulk_head_segs);
      });
    };

    let result = {
      lee: {},
      wind: {},
    };

    if (draw_lee) {
      let lee_initial_node = build_initial_node("LEE", this.lee_segments);
      let lee_model_map: IModelMap = {};
      populate_nodes(lee_initial_node, this.lee_segments, this.lee_curves);

      lee_initial_node.as_list().forEach((node, idx) => {
        node.bulkheads.forEach((line, l_idx) => {
          lee_model_map["bulkhead_" + idx + "_" + l_idx] = {
            layer: "blue",
            ...points_to_imodel(false, line),
          };
        });
        lee_model_map["outline_"+idx] = node.draw_node();
      });

      // let lee = lee_initial_node.to_continuous_points([]);
      // lee_model_map["outline"] = points_to_imodel(false, lee);
      result.lee = { models: lee_model_map };
    }

    if (draw_wind) {
      let wind_initial_node = build_initial_node("WIND", this.wind_segments);
      let wind_model_map: IModelMap = {};
      populate_nodes(wind_initial_node, this.wind_segments, this.wind_curves);

      wind_initial_node.as_list().forEach((node, idx) => {
        node.bulkheads.forEach((line, l_idx) => {
          wind_model_map["bulkhead_" + idx + "_" + l_idx] = {
            layer: "blue",
            ...points_to_imodel(false, line),
          };
        });
        wind_model_map["outline_"+idx] = node.draw_node();
      });

      // let wind = wind_initial_node.to_continuous_points([]);
      // (wind_model_map["outline"] = points_to_imodel(false, wind)),
        (result.wind = { models: wind_model_map });
    }

    return result;
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
      return points_to_imodel(
        false,
        segment.hull_curve.getLUT().map((p) => flatten_point(p, dimm))
      );
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
        points_to_draw.push(segment.hull_curve.get(t.y));
      }
      return points_to_imodel(
        false,
        points_to_draw.map((p) => flatten_point(p, dimm))
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
