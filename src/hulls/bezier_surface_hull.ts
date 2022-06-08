import MakerJs, { IModel } from "makerjs";
import { pi } from "mathjs";
import { DrawableHull, FlattenResult, PanelSplits } from "../hull_test";
import { points_to_imodel } from "../utils/makerjs_tools";
import {
    DivisionCurve,
    RationalBezierSurface,
} from "../curves/rational_bezier_surface";
import { RationalBounds } from "../euclidean/rational_bounds";
import { unroll_beziers, unroll_point_set } from "../utils/rational_math";
import { RationalPlane } from "../euclidean/rational_plane";
import { Point2D, Point3D } from "../euclidean/rational_point";
import { UpperNode } from "../flatten_node/upper_node";
import {
    FillResult,
    node_as_list,
    node_to_continuous_points,
    split_node_recursive,
} from "../flatten_node/draw_nodes";

export class BezierSurfaceHull implements DrawableHull {
    draw_main_curves(dimm: number): MakerJs.IModel {
        return {
            models: {
                wind: this.surface_wind.draw_controls(dimm),
                lee: this.surface_lee.draw_controls(dimm),
                wind_bulkheads: {
                    layer: "blue",
                    ...this.surface_wind.draw_intersecting_lines(dimm),
                },
                lee_bulkheads: {
                    layer: "blue",
                    ...this.surface_lee.draw_intersecting_lines(dimm),
                },
            },
        };
    }

    draw_segments(
        dimm: number,
        number_segs: number,
        lee: boolean,
        wind: boolean,
        as_divisions: boolean
    ): MakerJs.IModel {
        return {
            models: {
                wind: wind
                    ? this.surface_wind.draw_surface_curves(
                          dimm,
                          number_segs,
                          as_divisions
                      )
                    : {},
                lee: lee
                    ? this.surface_lee.draw_surface_curves(
                          dimm,
                          number_segs,
                          as_divisions
                      )
                    : {},
            },
        };
    }

    draw_hull_curves(
        bezier: boolean,
        dimension: number,
        lee: boolean,
        wind: boolean
    ): MakerJs.IModel {
        return {
            models: {
                lee: lee
                    ? this.surface_lee.draw_division_curves(bezier, dimension)
                    : {},
                wind: wind
                    ? this.surface_wind.draw_division_curves(bezier, dimension)
                    : {},
            },
        };
    }

    draw_flattened_hull(
        lee: boolean,
        wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        straight_lowers: boolean,
    ): FlattenResult {
        const populate_nodes = (
            prefix: string,
            surface: RationalBezierSurface,
            full_model: IModel,
            panels: IModel[],
            bounds: RationalBounds<Point2D>
        ) => {
            // This is a little complicated. We want the end result to start at
            //  P.Zero, then there's a little triangle missing at the tip
            const { t_last, b_last } = surface.flatten_tip(
                pi,
                Point2D.Zero,
                false
            );
            const draw_down_ref_dir = (3 * pi) / 2;
            const draw_up_ref_dir = pi / 2;

            const init_fill: FillResult = {
                draw_up_ref_dir,
                draw_down_ref_dir,
                ref_point_upper: t_last,
                ref_point_lower: b_last,
                ref_dir_lower: b_last.as_unit(),
                ref_dir_upper: t_last.as_unit(),
            };

            const initial_node = new UpperNode(
                surface.intersecting_lines.length,
                prefix,
                0,
                0,
                surface.surface_curves.length - 1,
                init_fill,
                (_) => 1.0,
                (_) => 0.0
            );

            initial_node.upper_nodes.push(Point2D.Zero);

            const curves = [...surface.division_curves];

            // We want to process the curves in order from closest to bow back
            const bezier_sort = (a: DivisionCurve, b: DivisionCurve) => {
                return b.end - a.end;
            };
            const sorted_curves = curves.sort(bezier_sort);

            // Try to fill our initial node recursively
            split_node_recursive(
                initial_node,
                surface.surface_curves,
                sorted_curves,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                straight_lowers,
            );

            const a = initial_node.upper_nodes[1];
            const b = initial_node.upper_nodes[2];
            const rot = (a.axis_angle(0, b) * -180) / pi + 180;

            const full_model_map = full_model.models;
            if (full_model_map != undefined) {
                node_as_list(initial_node).forEach((node, idx) => {
                    node.bulkheads.forEach((line, b_id) => {
                        let bh = points_to_imodel(2, false, line);
                        bh = MakerJs.model.rotate(bh, rot);
                        bh.layer = "blue";
                        full_model_map["bulkhead_" + idx + "_" + b_id] = bh;
                    });
                    panels.push(node.draw_node());
                });

                const points = node_to_continuous_points(initial_node, []);
                points.forEach((p) => bounds.consume(p));
                let model = points_to_imodel(2, true, points);
                model = MakerJs.model.rotate(model, rot);
                full_model_map["outline"] = model;
            }
        };

        let result: FlattenResult = {
            lee: { models: {} },
            wind: { models: {} },
            lee_panels: [],
            wind_panels: [],
            bounds_lee: new RationalBounds(Point2D.Zero),
            bounds_wind: new RationalBounds(Point2D.Zero),
        };

        if (lee) {
            populate_nodes(
                "LEE",
                this.surface_lee,
                result.lee,
                result.lee_panels,
                result.bounds_lee
            );
        }

        if (wind) {
            populate_nodes(
                "WIND",
                this.surface_wind,
                result.wind,
                result.wind_panels,
                result.bounds_wind
            );
        }

        return result;
    }

    draw_transom(): IModel {
        // Transom is simple an unroll of the first curves from both the lee and
        //  wind sides
        const full_interval = { start: 1, end: 0 };
        const unroll = unroll_beziers(
            this.surface_lee.surface_curves[0].c,
            full_interval,
            this.surface_wind.surface_curves[0].c,
            full_interval,
            Point2D.Zero,
            (3 * pi) / 2,
            Point2D.X,
            false,
        );
        const unroll_angle = unroll.b_flat[0].axis_angle(0, unroll.a_flat[0]);
        let unroll_model = points_to_imodel(
            0,
            true,
            unroll.a_flat.concat(unroll.b_flat.reverse())
        );

        unroll_model = MakerJs.model.rotate(
            unroll_model,
            (-180 / pi) * unroll_angle
        );
        return unroll_model;
    }

    volume_under(dist: number): number {
        // Since the curves are approximately contours of eachother, we can
        //  approximate volume by projecting the curves onto the YZ plane,
        //  getting the area, and multiplying by the distance between the top
        //  points of this curve and the next
        const surface_to_volume = (surface: RationalBezierSurface): number => {
            let volume = 0;

            for (let i = 0; i < surface.surface_curves.length - 1; i++) {
                const curve = surface.surface_curves[i];
                const length = curve.c.lut[0].p.dist(
                    surface.surface_curves[i + 1].c.lut[0].p
                );
                const wl = curve.c.find_dimm_dist(1, dist);

                if (wl.t <= 0) {
                    break;
                }

                volume += length * curve.c.find_area(0, wl.t, 1, 2);
            }
            return volume;
        };

        return (
            surface_to_volume(this.surface_lee) +
            surface_to_volume(this.surface_wind)
        );
    }

    draw_bulkhead(idx: number): MakerJs.IModel {
        const line_lee = this.surface_lee.intersecting_lines[idx];
        const line_wind = this.surface_wind.intersecting_lines[idx];

        if (line_lee.length == 0 || line_wind.length == 0) {
            console.log("NO POINTS FOR BULKHEAD ", idx);
            return {};
        }

        // Bulkheads, like the transom, are unrolled
        const unroll = unroll_point_set(
            line_lee,
            line_wind,
            false,
            Point2D.Zero,
            (3 * pi) / 2,
            Point2D.X,
            false,
        );

        const unroll_angle = unroll.b_flat[0].axis_angle(0, unroll.a_flat[0]);
        let unroll_model = points_to_imodel(
            0,
            true,
            unroll.a_flat.concat(unroll.b_flat.reverse())
        );

        unroll_model = MakerJs.model.rotate(
            unroll_model,
            (-180 / pi) * unroll_angle
        );
        return unroll_model;
    }

    surface_lee: RationalBezierSurface;
    surface_wind: RationalBezierSurface;
    constructor(
        wind_curves: Point3D[][],
        lee_curves: Point3D[][],
        panels: PanelSplits[],
        intersecting_planes: RationalPlane[]
    ) {
        this.surface_lee = new RationalBezierSurface(
            lee_curves,
            panels,
            intersecting_planes
        );
        this.surface_wind = new RationalBezierSurface(
            wind_curves,
            panels,
            intersecting_planes
        );
    }
}
