import { IModel, IModelMap } from "makerjs";
import { abs, pi } from "mathjs";
import { DrawableHull, FlattenResult } from "./hull_test";
import { FlattenNode } from "./flatten_node";
import { points_to_imodel } from "./makerjs_tools";
import {
    DivisionCurve,
    RationalBezierSurface,
} from "./rational_bezier_surface";
import { unroll_point_set } from "./rational_math";
import { Point2D, Point3D } from "./rational_point";
import { RationalPlane } from "./rational_plane";

export class BezierSurfaceHull implements DrawableHull {
    draw_main_curves(dimm: number): MakerJs.IModel {
        return {
            models: {
                wind: this.surface_wind.draw_controls(dimm),
                lee: this.surface_lee.draw_controls(dimm),
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
        puzzle_tooth_angle: number
    ): FlattenResult {
        const populate_nodes = (
            prefix: string,
            surface: RationalBezierSurface,
            full_model: IModel,
            panels: IModel[]
        ) => {
            // This is a little complicated. We want the end result to start at
            //  P.Zero, then there's a little triangle missing at the tip
            const { t_last, b_last } = surface.flatten_tip(
                pi,
                Point2D.Zero,
                false
            );
            const ref_draw_down = t_last.axis_angle(0, b_last);
            const ref_draw_up = b_last.axis_angle(0, t_last);

            const initial_node = new FlattenNode(
                prefix,
                0,
                0,
                surface.surface_curves.length - 1,
                false,
                t_last,
                ref_draw_up,
                ref_draw_down,
                (_) => 1.0,
                (_) => 0.0
            );

            initial_node.upper_nodes.push(Point2D.Zero);

            const curves = [...surface.division_curves];

            // We want to process the curves in order from closes to bow back
            const bezier_sort = (a: DivisionCurve, b: DivisionCurve) => {
                return b.end - a.end;
            };
            const sorted_curves = curves.sort(bezier_sort);

            // Try to fill our initial node recursively
            initial_node.try_split_recursive(
                surface.surface_curves,
                sorted_curves,
                puzzle_tooth_width,
                puzzle_tooth_angle,
                new Set()
            );

            const full_model_map = full_model.models;
            if (full_model_map != undefined) {
                initial_node.as_list().forEach((node, idx) => {
                    node.bulkheads.forEach((line, b_id) => {
                        full_model_map["bulkhead_" + idx + "_" + b_id] = {
                            layer: "blue",
                            ...points_to_imodel(2, true, line),
                        };
                    });
                    panels.push(node.draw_node());
                });

                full_model_map["outline"] = points_to_imodel(
                    2,
                    true,
                    initial_node.to_continuous_points([])
                );
            }
        };

        let result: FlattenResult = {
            lee: { models: {} },
            wind: { models: {} },
            lee_panels: [],
            wind_panels: [],
        };

        if (lee) {
            populate_nodes(
                "LEE",
                this.surface_lee,
                result.lee,
                result.lee_panels
            );
        }

        if (wind) {
            populate_nodes(
                "WIND",
                this.surface_wind,
                result.wind,
                result.wind_panels
            );
        }

        return result;
    }

    draw_transom(): IModel {
        // Transom is simple an unroll of the first curves from both the lee and
        //  wind sides
        const full_interval = { start: 1, end: 0 };
        const unroll = unroll_point_set(
            this.surface_lee.surface_curves[0].c,
            full_interval,
            this.surface_wind.surface_curves[0].c,
            full_interval,
            false,
            Point2D.Zero,
            (3 * pi) / 2,
            false
        );
        return {
            models: {
                transom: points_to_imodel(
                    0,
                    true,
                    unroll.a_flat.concat(unroll.b_flat.reverse())
                ),
            },
        };
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
        throw new Error("Method not implemented.");
    }

    surface_lee: RationalBezierSurface;
    surface_wind: RationalBezierSurface;
    constructor(
        wind_curves: Point3D[][],
        lee_curves: Point3D[][],
        variance_tolerance: number,
        max_segments: number,
        intersecting_planes: RationalPlane[],
    ) {
        this.surface_lee = new RationalBezierSurface(
            lee_curves,
            variance_tolerance,
            max_segments,
            intersecting_planes,
        );
        this.surface_wind = new RationalBezierSurface(
            wind_curves,
            variance_tolerance,
            max_segments,
            intersecting_planes,
        );
    }
}
