import { Point } from "bezier-js";
import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, IPathMap, } from "makerjs";
import { pi, tan } from "mathjs";
import { CustomBezier } from "./bezier";
import { BoxedPathHull } from "./boxed_path_hull";
import { color_naturally, colours, flatten_point, point_to_ipoint } from "./makerjs_tools";

let points: Point[] = [
    { x: 0, y: 7, z: 10 },
    { x: 5, y: 10, z: 0 },
    { x: 7, y: 0, z: 5 },
    { x: 10, y: 5, z : 7 },
];

let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), 50);
    var svg = exporter.toSVG(to_export);
    fs.writeFile(name + ".svg", svg, (_) => {});
  };
  

let custom_bezier = new CustomBezier(points);
let split_segments = custom_bezier.split(0.5);
let center_segment = custom_bezier.split_segment(0.1, 0.9);

let dimm_maps: IModelMap = {};
let path_maps: IPathMap = {};

for(let i = 0; i < 3; i ++) {

    let model: IModel = {};//custom_bezier.draw(i);
    model.models = {
        // a: {layer: "red", ...split_segments.lower.draw(i)},
        // b: {layer: "blue", ...split_segments.upper.draw(i)},
        // c: {layer: "lime", ...center_segment.draw(i)},
    }
    dimm_maps["dimm_" + i] = model;
    
    let flattened_curve = new CustomBezier(custom_bezier.controls.map(p => {
        return flatten_point(p, i);
    }));
    let arcs = flattened_curve.arcs(0.005);

    arcs.map(arc => {
        console.log(arc);
        return new MakerJs.paths.Arc(point_to_ipoint(arc), arc.radius, arc.start * 180 / pi, arc.end * 180 /pi)
    }).map(color_naturally).forEach((arc, idx) => {
        path_maps["arc_" + i + "_" + idx] = arc;
    });
}

export_svg("bezier_test", {models: dimm_maps, paths: path_maps});