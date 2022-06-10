import { IModel, IModelMap, IPathMap } from "makerjs";
import { floor, min } from "mathjs";
import { CatmullRom } from "./catmull_rom";
import { PanelSplits } from "../hull_test";
import { colinear_filter_points, color_dark, color_naturally, points_to_imodel } from "../utils/makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { RationalPlane } from "../euclidean/rational_plane";
import { Point2D, Point3D } from "../euclidean/rational_point";

export interface DivisionCurve {
    id_start: number;
    start: number;
    id_end: number;
    end: number;
    t_curve: CatmullRom;
    p_line: Point3D[]; // While curve reduction would work fine, curve fitting?
}

export interface SurfaceCurve {
    u: number;
    c: RationalBezier<Point3D>;
    intersections: number[][];
}

export class RationalBezierSurface {
    control_curves: RationalBezier<Point3D>[];
    surface_curves: SurfaceCurve[];
    division_curves: DivisionCurve[];
    intersecting_lines: Point3D[][];

    // Flattens the tip onto the plane. The reference direction serves as a
    //  basis for the direction from the tip, to the previous point in the top
    //  control curve. The point serves as the basis of the triangle.
    //
    //  top_last ---- p_last
    //  |           /
    //  |         /
    //  |       /
    //  |     /
    //  bot_last
    //
    flatten_tip(
        direction: number,
        p: Point2D,
        clockwise: boolean
    ): {
        t_last: Point2D;
        b_last: Point2D;
    } {
        // Gathering the information
        const last_c = this.surface_curves[this.surface_curves.length - 1];
        const p_last =
            this.control_curves[0].controls[
                this.control_curves[0].controls.length - 1
            ];
        const top_last = last_c.c.controls[0];
        const bot_last = last_c.c.get_internal(last_c.c.lut[1].t / 4);

        const d_ct = p_last.dist(top_last);
        const t_last = p.flat_rotation(0, d_ct, direction);

        const d_cb = p_last.dist(bot_last);
        const a = top_last.sub(p_last).angle(bot_last.sub(p_last));
        const b_last = clockwise
            ? p.flat_rotation(0, d_cb, direction - a)
            : p.flat_rotation(0, d_cb, direction + a);

        return {
            t_last,
            b_last,
        };
    }

    draw_controls(dimm: number): IModel {
        const models: IModelMap = {};
        this.control_curves.forEach((c, i) => {
            models["c_" + i] = color_dark(c.draw(dimm), i);
        });
        return { models };
    }

    draw_surface_curves(dimm: number, n: number, segments: boolean): IModel {
        const models: IModelMap = {};
        const paths: IPathMap = {};
        const n_step = floor(this.surface_curves.length / n);
        for (let i = 0; i < this.surface_curves.length - 2; i++) {
            if (i % n_step == 0) {
                if (segments) {
                    const prefix = "sc_" + i + "_";
                    this.surface_curves[i].c.segments
                        .map((s) => s.draw(dimm))
                        .map(color_naturally)
                        .forEach((d, j) => {
                            paths[prefix + j] = d;
                        });
                } else {
                    models["sc_" + i] = this.surface_curves[i].c.draw(dimm);
                }
            }
        }
        return { models, paths };
    }

    draw_division_curves(bezier: boolean, dimm: number): IModel {
        const models: IModelMap = {};
        if (bezier) {
            this.division_curves
                .map((c) =>
                    c.t_curve
                        .as_list()
                        .map((p) => this.get_point_on_surface(p.x, p.y))
                )
                .map((c) => points_to_imodel(dimm, false, c))
                .map(color_dark)
                .forEach((c, i) => {
                    models["dc_" + i] = c;
                });
        } else {
            this.division_curves
                .map((c) => points_to_imodel(dimm, false, c.p_line))
                .map(color_dark)
                .forEach((c, i) => {
                    models["dc_" + i] = c;
                });
        }
        return { models };
    }

    draw_intersecting_lines(dimm: number): IModel {
        const models: IModelMap = {};
        for (let i = 0; i < this.intersecting_lines.length; i++) {
            const line = this.intersecting_lines[i];
            if (line.length > 0) {
                models["bh_" + i] = points_to_imodel(dimm, false, line);
            }
        }
        return { models };
    }

    get_point_on_surface(u: number, t: number): Point3D {
        let u_id = min(
            floor(u * this.surface_curves.length),
            this.surface_curves.length - 2
        );

        while (this.surface_curves[u_id].u > u) {
            u_id--;
        }

        while (
            u_id < this.surface_curves.length - 2 &&
            this.surface_curves[u_id + 1].u < u
        ) {
            u_id++;
        }

        const c_low = this.surface_curves[u_id];
        const c_high = this.surface_curves[u_id + 1];
        const u_r = u - c_low.u;
        const s_r = 1 - u_r;

        const a = c_low.c.get(t);
        const b = c_high.c.get(t);

        return a.mul(s_r).add(b.mul(u_r));
    }

    constructor(
        controls: Point3D[][],
        panels: PanelSplits[],
        intersecting_planes: RationalPlane[]
    ) {
        // First make our control Beziers
        this.control_curves = controls.map((cs) => new RationalBezier(cs));

        // Now we need to find our maximum number of divisions
        let divisions = this.control_curves[0].get_min_resolution(0, 1);
        for (let i = 1; i < this.control_curves.length; i++) {
            divisions = min(
                divisions,
                this.control_curves[i].get_min_resolution(0, 1)
            );
        }

        // For our intersecting planes, we need to traverse the surface curves
        //  in order, and append valid intersections to the appropriate list.
        //  We'll do this while creating the curves so that they can track
        //  the t-values, then sort the list after
        this.intersecting_lines = [];
        for (let i = 0; i < intersecting_planes.length; i++) {
            this.intersecting_lines.push([]);
        }

        // With that done, we can iteraritively make our internal curves, these
        //  will map properly to the t-domain of the control curves, and
        //  interpolating can be done for 3 dimensions. We skip the last one
        //  since we know it's degenerate (for our purposes). This is also a
        //  great time to gather up our divisors to remap them as division
        //  curves
        const divisors: { id: number; divs: Point2D[]; ps: Point3D[] }[] = [];
        const panel_sets = [...panels].sort((a, b) => b.t - a.t);
        this.surface_curves = new Array(divisions - 1);

        let n_segments = 1;
        for (let id = divisions - 1; id >= 0; id--) {
            const u = id / divisions;
            if (panel_sets.length > 0 && u < panel_sets[0].t) {
                n_segments = panel_sets[0].n;
                panel_sets.shift();
            }
            const curve = new RationalBezier(
                this.control_curves.map((c) => c.get(u))
            );
            const segments = curve.find_segments(10000, n_segments, n_segments);
            if (segments.length > 1) {
                const divs = [];
                const ps = [];
                for (let i = 0; i < segments.length - 1; i++) {
                    divs.push(new Point2D(u, segments[i].end_t, 1));
                    ps.push(segments[i].end_p);
                }
                divisors.push({
                    id,
                    divs,
                    ps,
                });
            }

            const curve_intersections: number[][] = [];

            for (
                let line_id = 0;
                line_id < intersecting_planes.length;
                line_id++
            ) {
                const line = this.intersecting_lines[line_id];
                const plane = intersecting_planes[line_id];
                const intersections = curve.find_plane_intersection(plane);
                curve_intersections.push(intersections.map((i) => i.t));
                intersections.forEach((i) => line.push(i.p));
            }

            curve_intersections.forEach((l) => l.sort().reverse());

            this.surface_curves[id] = {
                u,
                c: curve,
                intersections: curve_intersections,
            };
        }
        this.intersecting_lines.forEach((l) =>
            l.sort((a, b) => {
                return b.y - a.y;
            })
        );

        /**
         * With that done we can remap the divisors into curves and store them
         *  for later (same algorithm as the segmented_hull!)
         */
        const hull_curves: { t: Point2D; p: Point3D; id: number }[][] = [];
        let div = divisors.pop();
        if (div != undefined) {
            for (let i = 0; i < div.divs.length; i++) {
                hull_curves.push([
                    {
                        t: div.divs[i],
                        p: div.ps[i],
                        id: div.id,
                    },
                ]);
            }
            while ((div = divisors.pop()) != undefined) {
                for (let i = 0; i < div.divs.length; i++) {
                    hull_curves[i].push({
                        t: div.divs[i],
                        p: div.ps[i],
                        id: div.id,
                    });
                }
            }
        }

        // Convex hull of t points. Maybe a better solution can come from the
        //  hull of the p points? Particularly if the hull shape simplifies at
        //  both ends
        for (let c = 0; c < hull_curves.length; c++) {
            const curve = hull_curves[c];
            const new_curve = [];
            for (let i = 0; i < curve.length; i++) {
                const next = curve[i];
                if (new_curve.length >= 2) {
                    while (
                        new_curve.length >= 2 &&
                        new_curve[new_curve.length - 2].t
                            .sub(next.t)
                            .cross(
                                new_curve[new_curve.length - 1].t.sub(next.t)
                            ) <= 0
                    ) {
                        new_curve.pop();
                    }
                }
                new_curve.push(next);
            }
            hull_curves[c] = new_curve;
        }

        // Finally these can be mapped into RationalBeziers
        this.division_curves = hull_curves.map((c) => {
            return {
                id_start: c[0].id,
                start: c[0].t.x,
                id_end: c[c.length - 1].id,
                end: c[c.length - 1].t.x,
                t_curve: new CatmullRom(
                    c.map((i) => i.t),
                    0.95,
                    0.05,
                    true
                ),
                p_line: c.map((i) => i.p),
            };
        });
    }
}
