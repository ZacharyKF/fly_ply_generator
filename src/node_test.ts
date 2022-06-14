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

const export_svg = (name: string, model: IModel) => {
    const to_export = MakerJs.model.scale(MakerJs.model.clone(model), 100);
    const svg = exporter.toSVG(to_export);
    fs.writeFile("svg/" + name + ".svg", svg, (_) => {});
};

const punt = get_fogo_island_gunning_punt();

const surf = new RationalBezierSurface(punt.lee, [], []);

const d_y = 35.815418785859976 - 28.440901859996906;
const d_z = 28.440901859996906 - 0;
const d_test = sqrt(d_y * d_y + d_z * d_z);

// for (let i = 1; i < 3; i++) {
//     const test_node = new SquareNode(
//         i,
//         Point2D.Zero,
//         () => 1,
//         () => 0,
//         50/100,
//         Point2D.Y.mul(-d_test)
//     );
//     test_node.fill(surf, 70/100);
// }

const start = 0.5;
const end = 0.7;

const start_id = floor(surf.surface_curves.length * start);
const end_id = floor(surf.surface_curves.length * end);

const c_start = surf.surface_curves[start_id];
const c_end = surf.surface_curves[end_id];

const fill_last: FillResult = {
    draw_up_ref_dir: 0,
    draw_down_ref_dir: 3 * pi /2,
    ref_point_upper: Point2D.Zero,
    ref_point_lower: Point2D.Zero,
    ref_dir_upper: Point2D.X.mul(-1),
    ref_dir_lower: Point2D.X.mul(-1),
};

const heuristic_node = new UpperNode(
    0,
    "",
    1,
    0,
    end_id,
    fill_last,
    () => 1,
    () => 0,
);

heuristic_node.fill(surf.surface_curves, start_id, 0.01, 10);

const test_node = new SquareNode(
    6,
    heuristic_node.upper_nodes[0],
    () => 1,
    () => 0,
    c_start.u,
    heuristic_node.lower_nodes[0]
);

test_node.fill(surf, c_end.u);

const model = {
    models: {
        all_points: new MakerJs.models.Holes(0.15, test_node.square.map(p => p.false_point.to_ipoint(0))),
        fixed_points: {
            layer: "red",
            ...new MakerJs.models.Holes(0.15 * 0.8, [
                test_node.square[test_node.fixed_idx_a].false_point.to_ipoint(0),
                test_node.square[test_node.fixed_idx_b].false_point.to_ipoint(0),
            ])
        },
        heuristic: heuristic_node.draw_node()
    }
}
export_svg("square_unwrap", model);
