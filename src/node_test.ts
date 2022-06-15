import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, IPathMap } from "makerjs";
import { abs, floor, min, mod, pi, sqrt, tan } from "mathjs";
import { BezierSurfaceHull } from "./hulls/bezier_surface_hull";
import { get_debug_proa } from "./hulls/debug_proa";
import { get_fogo_island_gunning_punt } from "./hulls/fogo_gunning_punt";
import { RationalBounds } from "./euclidean/rational_bounds";
import { RationalPlane } from "./euclidean/rational_plane";
import { Point2D, Point3D } from "./euclidean/rational_point";
import { relay_line } from "./utils/rational_math";
import {
    color_dark,
    color_naturally,
    make_arrow,
    points_to_imodel,
} from "./utils/makerjs_tools";
import { RationalBezierSurface } from "./curves/rational_bezier_surface";
import { SquareNode } from "./flatten_node/square_node";
import { UpperNode } from "./flatten_node/upper_node";
import { FillResult } from "./flatten_node/draw_nodes";
import { TriangleNode } from "./flatten_node/triangle_node";

const export_svg = (name: string, model: IModel) => {
    const to_export = MakerJs.model.scale(MakerJs.model.clone(model), 100);
    const svg = exporter.toSVG(to_export);
    fs.writeFile("svg/" + name + ".svg", svg, (_) => {});
};

const punt = get_fogo_island_gunning_punt();

const surf = new RationalBezierSurface(punt.lee, [], []);
const start = 0.5;
const end = 0.9999;

const start_id = floor(surf.surface_curves.length * start);
const end_id = floor(surf.surface_curves.length * end);

const c_start = surf.surface_curves[start_id];
const c_end = surf.surface_curves[end_id];

const { t_last, b_last } = surf.flatten_tip(pi, Point2D.Zero, false);

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

const heuristic_node = new UpperNode(
    0,
    "",
    1,
    0,
    end_id,
    init_fill,
    () => 1,
    () => 0
);

heuristic_node.upper_nodes.push(Point2D.Zero);

heuristic_node.fill(surf.surface_curves, start_id, 0.01, 10);

// const test_node = new SquareNode(
//     5,
//     heuristic_node.upper_nodes[0],
//     () => 1,
//     () => 0,
//     c_start.u,
//     heuristic_node.lower_nodes[0]
// );

const test_node = new TriangleNode(
    6,
    heuristic_node.upper_nodes[0],
    () => 1,
    () => 0,
    c_start.u,
    pi,
    Point2D.Y.mul(-1)
);

test_node.fill(surf, c_end.u);
const a = heuristic_node.upper_nodes[1];
const b = heuristic_node.upper_nodes[2];
const rot = (a.axis_angle(0, b) * -180) / pi + 180;

const model = {
    models: {
        all_points: new MakerJs.models.Holes(
            0.15,
            test_node.get_all().map((p) => p.to_ipoint(0))
        ),
        fixed_points: {
            layer: "red",
            ...new MakerJs.models.Holes(0.15 * 0.8, [
                test_node
                    .get_node(test_node.fixed_idx_a)
                    .false_point.to_ipoint(0),
                test_node
                    .get_node(test_node.fixed_idx_b)
                    .false_point.to_ipoint(0),
            ]),
        },
        heuristic: MakerJs.model.rotate(heuristic_node.draw_node(), rot),
    },
};
export_svg("square_unwrap", model);
