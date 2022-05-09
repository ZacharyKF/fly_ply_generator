import { Point } from "bezier-js";
import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, } from "makerjs";
import { pi, tan } from "mathjs";
import { CustomBezier } from "./bezier";
import { BoxedPathHull } from "./boxed_path_hull";

let points: Point[] = [
    { x: 0, y: 10, z: 15 },
    { x: 5, y: 15, z: 0 },
    { x: 10, y: 0, z: 5 },
    { x: 15, y: 5, z : 10 },
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

for(let i = 0; i < 3; i ++) {
    // i = 2;
    let model: IModel = custom_bezier.draw(i);
    model.models = {
        a: {layer: "red", ...split_segments.lower.draw(i)},
        b: {layer: "blue", ...split_segments.upper.draw(i)},
        c: {layer: "lime", ...center_segment.draw(i)},
    }
    dimm_maps["dimm_" + i] = model;
    // break;
}

export_svg("bezier_test", {models: dimm_maps});