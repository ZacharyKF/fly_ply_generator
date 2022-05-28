// Since the rational bezier hull can be pulled towards points, there's no need
//  for excess points to guide the hull in wacky directions. This design lets
//  the user lean more on the control points to create a smooth surface

import { IModel, IModelMap, IPathMap, model, models, point } from "makerjs";
import { abs, floor } from "mathjs";
import { DrawableHull, FlattenResult } from "./hull_test";
import { color_dark } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { Point2D, Point3D } from "./rational_point";
import { RationalSegment } from "./rational_segment";
import { SegmentedHull } from "./segmented_hull";

export interface HullSegment {
    dist: number;
    hull_curve: RationalBezier<Point3D>;
    curve_segments: RationalSegment<Point3D>[];
}

export class RationalBezierHull implements DrawableHull {
    wind_beziers: RationalBezier<Point3D>[];
    lee_beziers: RationalBezier<Point3D>[];
    hull_segments_lee: HullSegment[];
    hull_segments_wind: HullSegment[];
    internal_hull: SegmentedHull;

    constructor(
        wind_curves: Point3D[][],
        lee_curves: Point3D[][],
        segments: number,
        max_dist: number,
        variance_tolerance: number,
        max_segments: number,
        curve_colinearity_tolerance: number
    ) {
        this.wind_beziers = wind_curves.map(
            (curve) => new RationalBezier<Point3D>(curve)
        );
        this.lee_beziers = lee_curves.map(
            (curve) => new RationalBezier<Point3D>(curve)
        );

        this.hull_segments_lee = [];
        this.hull_segments_wind = [];

        let i_step = max_dist / segments;
        let min_segs_lee = 1;
        let min_segs_wind = 1;
        for (let i = max_dist - i_step; i >= 0; i -= i_step) {
            let lee_seg = this.make_segment(
                i,
                this.lee_beziers,
                min_segs_lee,
                max_segments,
                variance_tolerance
            );
            min_segs_lee = lee_seg.curve_segments.length;
            this.hull_segments_lee.unshift(lee_seg);

            let wind_seg = this.make_segment(
                i,
                this.wind_beziers,
                min_segs_wind,
                max_segments,
                variance_tolerance
            );
            min_segs_wind = wind_seg.curve_segments.length;
            this.hull_segments_wind.unshift(wind_seg);
        }

        this.internal_hull = new SegmentedHull(
            this.hull_segments_lee,
            this.hull_segments_wind,
            curve_colinearity_tolerance
        );
    }
    draw_hull_curves(dimension: number, lee: boolean, wind: boolean): IModel {
        return this.internal_hull.draw_hull_curves(dimension, lee, wind);
    }

    make_segment(
        dist: number,
        curves: RationalBezier<Point3D>[],
        min_segments: number,
        max_segments: number,
        variance_tolerance: number
    ): HullSegment {
        const points = curves
            .map((c) => c.find_dimm_dist(0, dist))
            .map((l) => l.p.set_dimm(dist, 0));

        const hull_curve = new RationalBezier<Point3D>(points);

        const curve_segments = hull_curve.find_segments(
            variance_tolerance,
            min_segments,
            max_segments
        );

        return {
            dist,
            hull_curve,
            curve_segments,
        };
    }

    // Since we have a convenient list of main curves, we can just draw them
    //  simply. Ensure the colours are dark so that they contrast with others
    draw_main_curves(dimm: number): MakerJs.IModel {
        let add_curves_to_model = (
            model_map: IModelMap,
            beziers: RationalBezier<Point3D>[]
        ): IModelMap => {
            beziers
                .map((b) => b.draw(dimm))
                .map(color_dark)
                .forEach((c, i) => (model_map["c_" + i] = c));
            return model_map;
        };

        return {
            models: {
                lee: { models: add_curves_to_model({}, this.lee_beziers) },
                wind: { models: add_curves_to_model({}, this.wind_beziers) },
            },
        };
    }

    // Drawing the segments just requires mapping the segments at distances onto
    //  the hull shape
    draw_segments(
        dimm: number,
        number_segs: number,
        lee: boolean,
        wind: boolean,
        as_divisions: boolean
    ): MakerJs.IModel {
        let segs_to_model = (segments: HullSegment[]): IModel => {
            let model_map: IModelMap = {};
            let path_map: IPathMap = {};
            let draw_step = floor(segments.length / number_segs);
            segments.forEach((s, i) => {
                if (i % draw_step == 0) {
                    if (as_divisions) {
                        let prefix = "seg_" + i + "_";
                        s.curve_segments
                            .map((rs) => rs.draw(dimm))
                            .map(color_dark)
                            .forEach((rs, j) => {
                                path_map[prefix + j] = rs;
                            });
                    } else {
                        model_map["seg_" + i] = s.hull_curve.draw(dimm);
                    }
                }
            });
            return { models: model_map, paths: path_map };
        };

        return {
            models: {
                lee: lee ? segs_to_model(this.hull_segments_lee) : {},
                wind: wind ? segs_to_model(this.hull_segments_wind) : {},
            },
        };
    }

    draw_flattened_hull(
        lee: boolean,
        wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: number[]
    ): FlattenResult {
        return this.internal_hull.draw_flattened_hull(
            lee,
            wind,
            puzzle_tooth_width,
            puzzle_tooth_angle,
            bulkheads
        );
    }

    // This is fairly easy, the idx is just for naming
    draw_bulkhead(dist: number, idx: number): MakerJs.IModel {
        let lee = this.make_segment(
            dist,
            this.lee_beziers,
            1,
            1,
            1
        ).hull_curve.as_list();
        let wind = this.make_segment(dist, this.wind_beziers, 1, 1, 1)
            .hull_curve.as_list()
            .reverse();
        let bulkhead: IModel = new models.ConnectTheDots(
            true,
            lee.concat(wind).map((p) => p.to_ipoint(0))
        );
        let caption_point = lee[0]
            .add(wind[0])
            .div(2)
            .add(lee[lee.length - 1].add(wind[wind.length - 1]).div(2))
            .div(2)
            .to_ipoint(0);
        model.addCaption(
            bulkhead,
            "BULKHEAD, " + idx,
            caption_point,
            caption_point
        );
        return bulkhead;
    }

    volume_under(dist: number): number {
        const segments_to_volume = (segments: HullSegment[]): number => {
            let volume = 0;
            let prev_dist = segments[0].dist;

            for (let i = 1; i < segments.length; i++) {
                const current_seg = segments[i];
                const l = current_seg.hull_curve.find_dimm_dist(1, dist);

                if (l.t <= 0) {
                    prev_dist = current_seg.dist;
                    continue;
                }

                volume += abs(
                    (prev_dist - current_seg.dist) *
                        current_seg.hull_curve.find_area(0, l.t, 1, 2)
                );

                prev_dist = current_seg.dist;
            }
            return volume;
        };

        return (
            segments_to_volume(this.hull_segments_lee) +
            segments_to_volume(this.hull_segments_wind)
        );
    }
}
