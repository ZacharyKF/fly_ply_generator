// Since the rational bezier hull can be pulled towards points, there's no need
//  for excess points to guide the hull in wacky directions. This design lets
//  the user lean more on the control points to create a smooth surface

import { IModel, IModelMap, IPathMap, model, models } from "makerjs";
import { floor } from "mathjs";
import { DrawableHull, FlattenResult } from "./boxed_hull_test";
import { color_dark, color_naturally } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { Point } from "./rational_point";
import { RationalSegment } from "./rational_segment";

export interface HullSegment {
    dist: number;
    hull_curve: RationalBezier;
    curve_segments: RationalSegment[];
}

export class RationalBezierHull implements DrawableHull {
    wind_beziers: RationalBezier[];
    lee_beziers: RationalBezier[];
    hull_segments_lee: HullSegment[];
    hull_segments_wind: HullSegment[];

    constructor(
        wind_curves: Point[][],
        lee_curves: Point[][],
        segments: number,
        max_dist: number,
        variance_tolerance: number,
        max_segments: number,
    ) {
        this.wind_beziers = wind_curves.map(
            (curve) => new RationalBezier(curve)
        );
        this.lee_beziers = lee_curves.map((curve) => new RationalBezier(curve));

        this.hull_segments_lee = [];
        this.hull_segments_wind = [];

        let i_step = max_dist / segments;
        let min_segs_lee = 1;
        let min_segs_wind = 1;
        for (let i = max_dist; i >= 0; i -= i_step) {
            let lee_seg = this.make_segment(
                i,
                this.lee_beziers,
                min_segs_lee,
                max_segments,
                variance_tolerance
            );
            min_segs_lee = lee_seg.curve_segments.length;
            this.hull_segments_lee.push(lee_seg);

            let wind_seg = this.make_segment(
                i,
                this.wind_beziers,
                min_segs_wind,
                max_segments,
                variance_tolerance
            );
            min_segs_wind = wind_seg.curve_segments.length;
            this.hull_segments_wind.push(wind_seg);
        }
    }

    make_segment(
        dist: number,
        curves: RationalBezier[],
        min_segments: number,
        max_segments: number,
        variance_tolerance: number,
    ): HullSegment {
        let hull_curve = new RationalBezier(
            curves
                .map((c) => c.find_dimm_dist(0, dist))
                .map((l) => l.p.set_dimm(dist, 0))
        );

        let curve_segments = hull_curve.find_segments(
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
            beziers: RationalBezier[]
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

    draw_hull_curves(
        dimm: number,
        lee: boolean,
        wind: boolean
    ): MakerJs.IModel {
        throw new Error("Method not implemented.");
    }

    draw_flattened_hull(
        lee: boolean,
        wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: number[]
    ): FlattenResult {
        throw new Error("Method not implemented.");
    }

    // This is fairly easy, the idx is just for naming
    draw_bulkhead(dist: number, idx: number): MakerJs.IModel {
        let lee = this.make_segment(
            dist,
            this.lee_beziers,
            1,
            1,
            1,
        ).hull_curve.as_list();
        let wind = this.make_segment(dist, this.wind_beziers, 1, 1, 1, )
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
        let volume = 0;
        let prev_dist = 0;

        for (let i = 0; i < this.hull_segments_lee.length; i++) {
            let current_seg = this.hull_segments_lee[i];
            let l = current_seg.hull_curve.find_dimm_dist(1, dist);

            if (l.t <= 0) {
                break;
            }

            volume +=
                (current_seg.dist - prev_dist) *
                current_seg.hull_curve.find_area(0, l.t, 1, 2);

            prev_dist = current_seg.dist;
        }

        prev_dist = 0;

        for (let i = 0; i < this.hull_segments_wind.length; i++) {
            let current_seg = this.hull_segments_wind[i];
            let l = current_seg.hull_curve.find_dimm_dist(1, dist);

            if (l.t <= 0) {
                break;
            }

            volume +=
                (current_seg.dist - prev_dist) *
                current_seg.hull_curve.find_area(0, l.t, 1, 2);
            prev_dist = current_seg.dist;
        }

        return volume;
    }
}
