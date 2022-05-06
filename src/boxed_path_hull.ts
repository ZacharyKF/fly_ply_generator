import { Bezier, Point } from "bezier-js";
import MakerJs, { IModel, models } from "makerjs";
import { abs, max, min } from "mathjs";
import { CustomBezier } from "./bezier";
import { DrawableHull } from "./boxed_hull_test";
import {
  colinear_filter,
  flatten_point,
  get_bezier_p_at_dimm_dist,
  get_bezier_t_at_dimm_dist,
  points_to_imodel,
  point_to_ipoint,
} from "./makerjs_tools";
import {
  circle_from_points,
  point_add,
  point_dot_a,
  point_mul,
  point_sub,
  point_vec_dot,
  point_vec_dot_norm,
} from "./math";
import { HullCurve, HullSegment, SegmentedHull } from "./segmented_hull";

export interface Interval {
  start: number;
  end: number;
}

export interface CurveOffsetIntervals {
  dist: number;
  seg_idx: number;
  intervals: Interval[];
}

export interface CurveOffsetInterval {
  dist: number;
  seg_idx: number;
  interval: Interval;
}

export class BoxedPathHull implements DrawableHull {
  gunnel_curve_lee: Bezier;
  gunnel_curve_wind: Bezier;
  bilge_curve: Bezier;
  control_curve: Bezier;
  length: number;
  tumblehome_curve: Bezier;
  hull_internal: SegmentedHull;

  constructor(
    gunnel_points_lee: Point[],
    gunnel_points_wind: Point[],
    bilge_points: Point[],
    control_points: Point[],
    length: number,
    tumblehome_points: Point[],
    segment_steps: number,
    arc_threshold: number,
    curve_colinearity_tolerance: number
  ) {
    // Now we want to create N (segment_steps) segments. Each segment is taken by getting the arcs at a particular point,
    //  and assigning them to the same number as the closest previous segment. For simplicity, segments are only logged
    //  if a change occurs
    let segments_lee: HullSegment[] = [];
    let segments_wind: HullSegment[] = [];

    let offsets_lee: CurveOffsetIntervals[] = [];
    let offsets_wind: CurveOffsetIntervals[] = [];

    let gunnel_curve_lee = new Bezier(gunnel_points_lee);
    let gunnel_curve_wind = new Bezier(gunnel_points_wind);
    let bilge_curve = new Bezier(bilge_points);
    let control_curve = new Bezier(control_points);
    let tumblehome_curve = new Bezier(tumblehome_points);

    let add_to_side = (
      dist: number,
      gunnel_curve: Bezier,
      segments: HullSegment[],
      offsets: CurveOffsetIntervals[]
    ) => {
      let at_d = BoxedPathHull.hull_at_d(
        gunnel_curve,
        bilge_curve,
        control_curve,
        tumblehome_curve,
        arc_threshold,
        segments.length,
        dist
      );
      segments.push(at_d.segment);
      offsets.push(at_d.offsets);
    };

    let dist_max = bilge_curve.get(1.0).x;

    let step = dist_max / segment_steps;
    for (let i = 0; i <= dist_max - step; i += step) {
      add_to_side(i, gunnel_curve_lee, segments_lee, offsets_lee);
      add_to_side(i, gunnel_curve_wind, segments_wind, offsets_wind);
    }

    // A bit of a work-around for drawing the nose tip. I need to add logic for a "tip segment"
    add_to_side(dist_max * 0.9995, gunnel_curve_lee, segments_lee, offsets_lee);
    add_to_side(dist_max * 0.9995, gunnel_curve_wind, segments_wind, offsets_wind);

    let lee_curves = BoxedPathHull.process_segments_into_hull_curve(
      offsets_lee,
      curve_colinearity_tolerance
    );
    let wind_curves = BoxedPathHull.process_segments_into_hull_curve(
      offsets_wind,
      curve_colinearity_tolerance
    );

    let hull_internal = new SegmentedHull(
      segments_lee,
      segments_wind,
      lee_curves,
      wind_curves
    );

    this.gunnel_curve_lee = gunnel_curve_lee;
    this.gunnel_curve_wind = gunnel_curve_wind;
    this.bilge_curve = bilge_curve;
    this.control_curve = control_curve;
    this.length = length;
    this.tumblehome_curve = tumblehome_curve;
    this.hull_internal = hull_internal;
  }
  draw_bulkhead(dist: number): MakerJs.IModel {
    return this.hull_internal.draw_bulkhead(dist);
  }
  draw_hull_curves(dimm: number, lee: boolean, wind: boolean): MakerJs.IModel {
    return this.hull_internal.draw_hull_curves(dimm, lee, wind);
  }
  draw_segments(
    dimm: number,
    number_segs: number,
    lee: boolean,
    wind: boolean
  ): MakerJs.IModel {
    return this.hull_internal.draw_segments(dimm, number_segs, lee, wind);
  }
  draw_flattened_hull(
    lee: boolean,
    wind: boolean,
    bulkheads: number[],
  ): { lee: IModel; wind: IModel } {
    return this.hull_internal.draw_flattened_hull(lee, wind, bulkheads);
  }

  static hull_at_d(
    gunnel_curve: Bezier,
    bilge_curve: Bezier,
    control_curve: Bezier,
    tumblehome_curve: Bezier,
    arc_threshold: number,
    seg_idx: number,
    dist: number
  ): {
    segment: HullSegment;
    offsets: CurveOffsetIntervals;
  } {
    let gunnel_t: number = get_bezier_t_at_dimm_dist(gunnel_curve, 0, dist);
    let gunnel: Point = gunnel_curve.get(gunnel_t);
    let bilge: Point = get_bezier_p_at_dimm_dist(bilge_curve, 0, dist);
    let control: Point = control_curve.get(gunnel_t);
    let tumblehome: number = 1.0 + tumblehome_curve.get(gunnel_t).y / 100.0;

    // create two arrays for the hull curves
    let center: Point = BoxedPathHull.calc_swap_diag(
      gunnel,
      bilge,
      control.y,
      tumblehome
    );

    let segment_points: Point[] = [bilge, center, gunnel];
    let hull_curve = new Bezier(segment_points);

    let segment: HullSegment = {
      dist,
      hull_curve,
    };

    let flattened_curve = new Bezier(
      segment_points.map((point) => flatten_point(point, 0))
    );
    let arcs = flattened_curve.arcs(arc_threshold);
    arcs.pop();

    // We want to ignore the gunnel and bow curves
    let offsets = {
      dist,
      seg_idx,
      intervals: arcs.map((arc) => {
        return arc.interval;
      }),
    };

    return {
      segment,
      offsets,
    };
  }

  static process_segments_into_hull_curve(
    offsets: CurveOffsetIntervals[],
    colinearity_tolerance: number
  ): HullCurve[] {
    // This is an array that we'll fill by matching segments appropiately to their parent curves
    let curve_point_list: {
      last_idx: number;
      last_interval: Interval;
      owned_offsets: CurveOffsetInterval[];
    }[] = [];

    let prev_offset = offsets[0];

    prev_offset.intervals.forEach((interval) => {
      curve_point_list.push({
        last_idx: 0,
        last_interval: interval,
        owned_offsets: [
          {
            dist: prev_offset.dist,
            seg_idx: prev_offset.seg_idx,
            interval,
          },
        ],
      });
    });

    for (let i = 1; i < offsets.length; i++) {
      let offset = offsets[i];

      // We need to match, or not match all our intervals
      for (let interval of offset.intervals) {
        let largest_overlap = 0;
        let largest_overlap_idx = 0;

        curve_point_list.forEach((bezier, idx) => {
          // Ignore curves that have been ended
          if (bezier.last_idx == i - 1) {
            let overlap =
              min(interval.end, bezier.last_interval.end) -
              max(interval.start, bezier.last_interval.start);

            if (overlap > 0 && overlap > largest_overlap) {
              largest_overlap = overlap;
              largest_overlap_idx = idx;
            }
          }
        });

        if (largest_overlap > 0) {
          curve_point_list[largest_overlap_idx].last_idx = i;
          curve_point_list[largest_overlap_idx].last_interval = interval;
          curve_point_list[largest_overlap_idx].owned_offsets.push({
            dist: offset.dist,
            seg_idx: offset.seg_idx,
            interval: interval,
          });
        }
      }

      prev_offset = offset;
    }

    curve_point_list.forEach((curve) => {
      if (curve.owned_offsets.length < 3) {
        return;
      }

      // First we need to map the offsets to points
      let points: { p: Point; idx: number }[] = curve.owned_offsets.map(
        (offset, idx) => {
          return {
            p: {
              x: offset.dist,
              y: offset.interval.end,
            },
            idx,
          };
        }
      );

      // Now, since we're dealing with a convex curve, we can abuse the fact that the angle between the midpoint, our
      //  current point, and the test point, must be maximized
      let center = point_mul(
        0.5,
        point_add(points[0].p, points[points.length - 1].p)
      );
      {
        let furthest_idx = 0;
        let smallest_angle = 2 ** 63;
        for (let i = 1; i < points.length - 1; i++) {
          let angle = point_dot_a(
            points[i].p,
            points[0].p,
            points[points.length - 1].p
          );
          if (angle < smallest_angle) {
            smallest_angle = angle;
            furthest_idx = i;
          }
        }
        center = circle_from_points(
          points[0].p,
          points[furthest_idx].p,
          points[points.length - 1].p
        );
      }

      // Our first list of valid points
      let hull: { p: Point; idx: number }[] = [points[0]];

      let idx = 0;
      let last_point = points[idx];
      let vec_last, vec_next, test_angle, temp_angle;
      do {
        vec_last = point_sub(center, last_point.p);
        test_angle = 0;

        for (let i = idx + 1; i < points.length; i++) {
          vec_next = point_sub(points[i].p, last_point.p);
          temp_angle = Math.acos(point_vec_dot_norm(vec_last, vec_next));

          if (temp_angle < test_angle) {
            continue;
          }

          test_angle = temp_angle;
          idx = i;
        }

        last_point = points[idx];
        hull.push(last_point);
      } while (idx < points.length - 1);

      // One more filter step needs to be done. Any sets of 3 points where they are sufficiently co-linear need the
      //  center-point removed
      hull = colinear_filter(hull, (val) => val.p, 2, colinearity_tolerance);

      curve.owned_offsets = hull.map((hull_point) => {
        return curve.owned_offsets[hull_point.idx];
      });
    });

    let hull_curves: HullCurve[] = curve_point_list.map((curve) => {
      let t_points: Point[] = curve.owned_offsets.map((offest) => {
        return {
          x: offest.dist,
          y: offest.interval.end,
        };
      });

      // return new CatmullRom(t_points, 2, true, curve.owned_offsets[0].seg_idx, curve.owned_offsets[curve.owned_offsets.length - 1].seg_idx);
      return {
        start_seg_idx: curve.owned_offsets[0].seg_idx,
        end_seg_idx:
          curve.owned_offsets[curve.owned_offsets.length - 1].seg_idx,
        curve: new CustomBezier(t_points),
      };
    });

    return hull_curves;
  }

  draw_main_curves(dimm: number): IModel {
    let curve_to_model = (curve: Bezier): IModel => {
      let points: Point[] = [];
      for (let i = 0; i <= 1.0; i += 0.0025) {
        points.push(curve.get(i));
      }
      return points_to_imodel(false, points.map(p => flatten_point(p, dimm)));
    };
    let gunnel_lee = curve_to_model(this.gunnel_curve_lee);
    let gunnel_wind = curve_to_model(this.gunnel_curve_wind);
    let bilge = curve_to_model(this.bilge_curve);

    return {
      models: {
        gunnel_lee,
        gunnel_wind,
        bilge,
      },
    };
  }

  static calc_swap_diag(
    gunnel: Point,
    bow: Point,
    mag: number,
    tumblehome: number
  ): Point {
    if (gunnel.z != undefined && bow.z != undefined) {
      let mid_point: Point = {
        x: (gunnel.x + bow.x) / 2.0,
        y: (gunnel.y + bow.y) / 2.0,
        z: (gunnel.z + bow.z) / 2.0,
      };

      // Since we know that we're projecting onto the YZ plane, we can just negate the Y to rotate
      let vec_diff: Point = {
        x: (gunnel.x - bow.x) / 2.0,
        y: (-1.0 * (gunnel.y - bow.y)) / 2.0,
        z: (gunnel.z - bow.z) / 2.0,
      };

      // We only care about the YZ magnitude, so we can use that to modify the vector
      let vec_mag =
        mag / Math.sqrt(vec_diff.x * vec_diff.x + vec_diff.y * vec_diff.y);

      if (vec_diff.z != undefined && mid_point.z != undefined) {
        return {
          x: mid_point.x,
          y: mid_point.y + vec_mag * vec_diff.y,
          z: (mid_point.z + vec_mag * vec_diff.z) * tumblehome,
        };
      }
    }
    return gunnel;
  }
}
