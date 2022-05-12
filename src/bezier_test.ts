import * as fs from "fs";
import MakerJs, {
    exporter,
    IModel,
    IModelMap,
    IPathMap,
    IPoint,
    models,
} from "makerjs";
import { color_naturally } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { Point } from "./rational_point";

let variance_tolerance = 0.00000000003;

let points: Point[] = [
    new Point(0, 0, 10, 1),
    new Point(10, 0, 0, 2),
    new Point(10, 10, 10, 1),
];

let rational_bezier = new RationalBezier(points);

let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), 100);
    var svg = exporter.toSVG(to_export);
    fs.writeFile(name + ".svg", svg, (_) => {});
};

let dimm_maps: IModelMap = {};
for (let d = 0; d < 3; d++) {
    dimm_maps["dimm_curve_" + d] = rational_bezier.draw(d);
}

let segments = rational_bezier.find_segments(variance_tolerance, 1, 20);
console.log("Number of segment: " + segments.length)

let t_points: IPoint[] = [];
let dimm_paths: IPathMap = {};
for (let d = 0; d < 3; d++) {
    segments
        .map((seg) => seg.draw(d))
        .map(color_naturally)
        .forEach((seg, i) => {
            dimm_paths["dimm_seg_" + d + "_" + i] = seg;
        });

    for (let i = 0; i <= 1.0; i += 0.025) {
        t_points.push(rational_bezier.get(i).to_ipoint(d));
    }
}
dimm_maps["t_points"] = { layer: "red", ...new models.Holes(0.025, t_points) };

export_svg("bezier_test", {
    models: {
        a: { models: dimm_maps },
        b: { paths: dimm_paths },
    },
});
