import * as fs from "fs";
import MakerJs, {
    exporter,
    IModel,
    IModelMap,
    IPathMap,
    IPoint,
    models,
} from "makerjs";
import { abs, pi } from "mathjs";
import { color_naturally } from "./makerjs_tools";
import { RationalBezier } from "./rational_bezier";
import { unroll_point_set } from "./rational_math";
import { Point2D, Point3D } from "./rational_point";

let variance_tolerance = 10;

let points: Point3D[] = [
    new Point3D(0, 0, 5, 1),
    new Point3D(10, 0, 4, 3),
    new Point3D(10, 10, 5, 1),
];

let rational_beziers = [new RationalBezier(points)];
rational_beziers.push(
    new RationalBezier(
        points.map((p) => {
            return p.set_dimm(-p.z, 2);
        })
    )
);

let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), 100);
    var svg = exporter.toSVG(to_export);
    fs.writeFile(name + ".svg", svg, (_) => {});
};

let dimm_maps: IModelMap = {};
for (let d = 0; d < 3; d++) {
        dimm_maps["dimm_curve_" + d] = rational_beziers[0].draw(d);
}

let segments = rational_beziers[0].find_segments(variance_tolerance, 1, 40);
console.log("Number of segment: " + segments.length);

let t_points: IPoint[] = [];
let casta_points: IPoint[] = [];
let dimm_paths: IPathMap = {};
for (let d = 0; d < 3; d++) {
    segments
        .map((seg) => seg.draw(d))
        .map(color_naturally)
        .forEach((seg, i) => {
            dimm_paths["dimm_seg_" + d + "_" + i] = seg;
        });

    for (let i = 0; i <= 1.0; i += 0.05) {
        let t_point = rational_beziers[0].get_internal(i);
        let struts = rational_beziers[0].get_struts(i);
        let c_point = struts[struts.length - 1][0];
        t_points.push(t_point.to_ipoint(d));
        casta_points.push(c_point.to_ipoint(d));
    }
}

// We shouldn't actually see the red circles
dimm_maps["t_points"] = { layer: "red", ...new models.Holes(0.025, t_points) };
dimm_maps["c_points"] = {
    layer: "blue",
    ...new models.Holes(0.025, casta_points),
};

let unroll = unroll_point_set(rational_beziers[0], rational_beziers[1], false, Point2D.Zero, pi/2, false);

let test_dist = 0;
rational_beziers[0].lut.forEach(l => {
    let t_actual = l.t;
    let t_test = l.d/rational_beziers[0].length;
    test_dist += abs(t_actual - rational_beziers[0].map_t(t_test));
});
console.log("DISTANCE TEST => ", test_dist)

dimm_maps["a_points"] = {layer: "green", ...new models.ConnectTheDots(false, unroll.a_flat.map(p => p.to_ipoint(2)))};
dimm_maps["b_points"] = {layer: "blue", ...new models.ConnectTheDots(false, unroll.b_flat.map(p => p.to_ipoint(2)))};

export_svg("bezier_test", {
    models: {
        a: { models: dimm_maps },
        b: { paths: dimm_paths },
    },
});
