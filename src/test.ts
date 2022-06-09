import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, IPathMap } from "makerjs";
import { abs, min, pi, tan } from "mathjs";
import { BezierSurfaceHull } from "./hulls/bezier_surface_hull";
import { get_debug_proa } from "./hulls/debug_proa";
import { get_fogo_island_gunning_punt } from "./hulls/fogo_gunning_punt";
import { RationalBounds } from "./euclidean/rational_bounds";
import { RationalPlane } from "./euclidean/rational_plane";
import { Point2D, Point3D } from "./euclidean/rational_point";
import { relay_line } from "./utils/rational_math";
import { points_to_imodel } from "./utils/makerjs_tools";

let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), 20);
    var svg = exporter.toSVG(to_export);
    fs.writeFile("../svg/" + name + ".svg", svg, (_) => {});
};


let line = [];
for(let i = 0; i < 10; i++) {
    line.push(new Point2D(i, i, 1));
}

let test = relay_line(line, 20);


let model = {
    models: {
        l: new MakerJs.models.Holes(0.1, line.map(p => p.to_ipoint(0))),
        t: {layer:"green", ...new MakerJs.models.Holes(0.075, test.map(p => p.to_ipoint(0)))},
    }
}

export_svg("test", model);