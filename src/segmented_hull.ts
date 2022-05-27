import { IModel, IModelMap } from "makerjs";
import { abs, max, min, number, pi } from "mathjs";
import PriorityQueue from "priority-queue-typescript";
import { SortedQueue } from "sorted-queue";
import { FlattenResult } from "./boxed_hull_test";
import { FlattenNode } from "./flatten_node";
import { colinear_filter, points_to_imodel } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { HullSegment } from "./rational_bezier_hull";
import { circle_center } from "./rational_math";
import { Point2D, Point3D } from "./rational_point";

export interface HullCurve {
    start_seg_idx: number;
    end_seg_idx: number;
    curve: RationalBezier<Point2D>;
}

export interface Interval {
    start: number;
    end: number;
}

export interface CurveOffsets {
    dist: number;
    seg_idx: number;
    divisors: number[];
}

export interface CurveOffset {
    dist: number;
    seg_idx: number;
    divisor: number;
}

const MAX_NUM = 2**63;

export class SegmentedHull {
    lee_segments: HullSegment[];
    wind_segments: HullSegment[];
    lee_curves: HullCurve[];
    wind_curves: HullCurve[];

    constructor(
        lee_segments: HullSegment[],
        wind_segments: HullSegment[],
        curve_colinearity_tolerance: number
    ) {
        this.lee_segments = lee_segments;
        this.wind_segments = wind_segments;

        let offsets_lee =
            SegmentedHull.segments_to_offset_divisors(lee_segments);
        let offsets_wind =
            SegmentedHull.segments_to_offset_divisors(wind_segments);

        this.lee_curves = SegmentedHull.process_segments_into_hull_curve(
            offsets_lee,
            curve_colinearity_tolerance
        );
        this.wind_curves = SegmentedHull.process_segments_into_hull_curve(
            offsets_wind,
            curve_colinearity_tolerance
        );
    }

    static segments_to_offset_divisors(
        segments: HullSegment[]
    ): CurveOffsets[] {
        const offset_divisors: CurveOffsets[] = [];

        segments.forEach((hull_seg, seg_idx) => {
            const divisors = new Array(hull_seg.curve_segments.length - 1);
            for (let i = 0; i < hull_seg.curve_segments.length - 1; i++) {
                divisors[i] = hull_seg.curve_segments[i].end_t;
            }

            offset_divisors.push({
                dist: hull_seg.dist,
                seg_idx,
                divisors,
            });
        });

        return offset_divisors;
    }

    static process_segments_into_hull_curve(
        offsets: CurveOffsets[],
        colinearity_tolerance: number
    ): HullCurve[] {
        // This is an array that we'll fill by matching segments appropiately to their parent curves
        let curve_point_list: {
            last_idx: number;
            divisor_set: CurveOffset[];
        }[] = [];

        for (let j = 0; j < offsets[0].divisors.length; j++) {
            curve_point_list.push({
                last_idx: 0,
                divisor_set: [
                    {
                        dist: offsets[0].dist,
                        seg_idx: offsets[0].seg_idx,
                        divisor: offsets[0].divisors[j],
                    },
                ],
            });
        }

        // Priority queue we'll use to sort our divisors we want the minimum
        //  distance for any matches
        for (let i = 1; i < offsets.length; i++) {
            const offset = offsets[i];

            // If there aren't any divisors, we can break
            if (offset.divisors.length == 0) {
                break;
            }

            // Since they're always ordered from top to bottom this is a simple
            //  operation
            for (let j = 0; j < offset.divisors.length; j++) {
                const divisor = offset.divisors[j];
                curve_point_list[j].divisor_set.push({
                    dist: offset.dist,
                    seg_idx: offset.seg_idx,
                    divisor
                });
            }
        }

        curve_point_list.forEach((curve) => {
            if (curve.divisor_set.length < 3) {
                return;
            }

            // First we need to map the offsets to points
            let points: { p: Point2D; idx: number }[] = curve.divisor_set.map(
                (offset, idx) => {
                    return {
                        p: new Point2D(offset.dist, offset.divisor, 1),
                        idx,
                    };
                }
            );

            // Now, since we're dealing with a convex curve, we can abuse the 
            //  fact that the angle between the midpoint, our current point, and
            //  the test point, must be maximized
            let center = points[0].p.add(points[points.length - 1].p).div(2);
            {
                let furthest_idx = 0;
                let smallest_angle = MAX_NUM;
                for (let i = 1; i < points.length - 1; i++) {
                    let angle = points[0].p
                        .sub(points[i].p)
                        .angle(points[points.length - 1].p.sub(points[i].p));

                    if (angle < smallest_angle) {
                        smallest_angle = angle;
                        furthest_idx = i;
                    }
                }

                let test_center = circle_center(
                    points[0].p,
                    points[furthest_idx].p,
                    points[points.length - 1].p
                );

                if (test_center == undefined) {
                    console.error("Could not find center");
                    return;
                } else {
                    center = test_center;
                }
            }

            // Our first list of valid points
            let hull: { p: Point2D; idx: number }[] = [points[0]];

            let idx = 0;
            let last_point = points[idx];
            let vec_last, vec_next, test_angle, temp_angle;
            do {
                vec_last = center.sub(last_point.p);
                test_angle = 0;

                for (let i = idx + 1; i < points.length; i++) {
                    vec_next = points[i].p.sub(last_point.p);
                    temp_angle = vec_last.angle(vec_next);

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
            hull = colinear_filter(
                hull,
                (val) => val.p,
                2,
                colinearity_tolerance
            );

            curve.divisor_set = hull.map((hull_point) => {
                return curve.divisor_set[hull_point.idx];
            });
        });

        const hull_curves: HullCurve[] = new Array(curve_point_list.length);
        for (let i = 0; i < curve_point_list.length; i++) {
            const curve = curve_point_list[i];
            const t_points: Point2D[] = curve.divisor_set.map((offest) => {
                return new Point2D(offest.dist, offest.divisor, 1);
            });

            hull_curves.push({
                start_seg_idx: curve.divisor_set[0].seg_idx,
                end_seg_idx:
                    curve.divisor_set[curve.divisor_set.length - 1].seg_idx,
                curve: RationalBezier.fit_to_points(t_points, 10),
            });
        }

        return hull_curves;
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

    draw_flattened_hull(
        draw_lee: boolean,
        draw_wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: number[]
    ): FlattenResult {
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
        let build_initial_node = (
            prefix: string,
            segments: HullSegment[]
        ): FlattenNode => {
            return new FlattenNode(
                prefix,
                0,
                0,
                segments.length - 1,
                false,
                Point2D.Zero,
                pi / 2.0,
                (3.0 * pi) / 2.0,
                (_) => 1.0,
                (_) => 0.0
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
            console.log("\n==== Populating Nodes ====");
            console.log("Number of curves: ", curves.length);

            // We want to process the curves in order from closes to bow back
            let bezier_sort = (a: HullCurve, b: HullCurve) => {
                return b.end_seg_idx - a.end_seg_idx;
            };
            let sorted_curves = curves.sort(bezier_sort);

            // Try to fill our initial node recursively
            initial_node.try_split_recursive(
                segments,
                sorted_curves,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                bulk_head_segs
            );
        };

        let result: FlattenResult = {
            lee: {},
            wind: {},
            lee_panels: [],
            wind_panels: [],
        };

        if (draw_lee) {
            let lee_initial_node = build_initial_node("LEE", this.lee_segments);
            let lee_model_map: IModelMap = {};
            populate_nodes(
                lee_initial_node,
                this.lee_segments,
                this.lee_curves
            );

            lee_initial_node.as_list().forEach((node, idx) => {
                node.bulkheads.forEach((line, l_idx) => {
                    lee_model_map["bulkhead_" + idx + "_" + l_idx] = {
                        layer: "blue",
                        ...points_to_imodel(2, true, line),
                    };
                });
                result.lee_panels.push(node.draw_node());
            });

            let lee = lee_initial_node.to_continuous_points([]);
            lee_model_map["outline"] = points_to_imodel(2, true, lee);
            result.lee = { models: lee_model_map };
        }

        if (draw_wind) {
            let wind_initial_node = build_initial_node(
                "WIND",
                this.wind_segments
            );
            let wind_model_map: IModelMap = {};
            populate_nodes(
                wind_initial_node,
                this.wind_segments,
                this.wind_curves
            );

            wind_initial_node.as_list().forEach((node, idx) => {
                node.bulkheads.forEach((line, l_idx) => {
                    wind_model_map["bulkhead_" + idx + "_" + l_idx] = {
                        layer: "blue",
                        ...points_to_imodel(2, true, line),
                    };
                });
                result.wind_panels.push(node.draw_node());
            });

            let wind = wind_initial_node.to_continuous_points([]);
            (wind_model_map["outline"] = points_to_imodel(2, true, wind)),
                (result.wind = { models: wind_model_map });
        }

        return result;
    }

    draw_hull_curves(dimension: number, lee: boolean, wind: boolean): IModel {
        let draw_curves = (
            curves: HullCurve[],
            segments: HullSegment[]
        ): IModel => {
            const models: IModelMap = {};
            curves.forEach((c, i) => {
                const points: Point3D[] = [];
                for (let j = c.end_seg_idx; j >= c.start_seg_idx; j--) {
                    const seg = segments[j];
                    const t = c.curve.find_dimm_dist(0, seg.dist).p.y;
                    points.push(seg.hull_curve.get(t));
                }
                models["curve_" + i] = points_to_imodel(
                    dimension,
                    false,
                    points
                );
            });
            return { models };
        };

        return {
            models: {
                lee: lee ? draw_curves(this.lee_curves, this.lee_segments) : {},
                wind: wind
                    ? draw_curves(this.wind_curves, this.wind_segments)
                    : {},
            },
        };
    }
}
