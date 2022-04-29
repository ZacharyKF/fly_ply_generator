import MakerJs, { IModel, IModelMap, IPathMap, IPoint, path, paths } from "makerjs";
import * as fs from "fs";
import * as math from "./math";
import { all, pi } from "mathjs";
import { modelToInvoluteGear } from "./draw_teeth";

var radius = 500;

var bezier_points = [
    [-radius, -radius],
    [-0.75 * radius, radius],
    [0.75 * radius, -radius],
    [radius, radius]
];

// var bezier = new MakerJs.models.BezierCurve(bezier_points);
var bezier = new MakerJs.models.Ellipse(radius, radius);
var model_bez = MakerJs.model.rotate(MakerJs.model.mirror(bezier, false, false), 270);

var tooth_height = 50;
var tooth_width = (2.0 * Math.PI * radius)/30;
var cycloid_rad = tooth_height * 2;

var teeth_model = modelToInvoluteGear(
    model_bez,
    cycloid_rad,
    tooth_width,
    tooth_height,
    0,
    5,
    tooth_width/10,
    tooth_height/10,
    true,
    false,
    1000,
);

var crosshair = new MakerJs.models.Holes(5, [[-1.2*radius, 0],[1.2*radius, 0],[0, -1.2*radius],[0, 1.2*radius],[0,0]]);
var debug_circle: MakerJs.IModel = {};

var model: IModel = {
    models: {
        model_bez: { layer: "red", ...model_bez },
        circle: { layer: "blue", ...debug_circle },
        crosshair: crosshair,
        teeth_model
    }
};

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1mm",
    units: MakerJs.unitType.Millimeter
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("test.svg", svg, _ => { });