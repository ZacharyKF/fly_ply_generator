import MakerJs, { IModel, IModelMap, IPathMap, IPoint, path, paths } from "makerjs";
import { drawCycloidalGearTeeth, spiralArc, unrollSpiralOntoArc } from "./custom_draw";
import * as fs from "fs";
import { modelToInvoluteGear } from "./draw_teeth";
import { circlePoint, circle_angle, signed_dot, slope } from "./math";

/**
 * The intention here is to draw an arc `pendulum_rad` away from it's center, on the inside and outside of the arc there will be gear teeth.
 * 
 * Running along these teeth will be 2 half arc involute curve gears, these gears will have a mechanical advantage ranging from some value `initial_advantage` to some value `final_advantage`. 
 */


// VARIABLES
var pendulum_rad = 500.0;
var arc_thickness = pendulum_rad / 20;
var initial_advantage = 0.25;
var final_advantage = 0.125;
var end_angle = Math.PI / 2;
var start_angle = (3.0 * Math.PI) / 2.0
var tooth_resolution = 100;
var tooth_give_horz = 10;
var engagement_angle = Math.PI / 4;

// SIMPLE DERIVED
var gear_rad_init = pendulum_rad * initial_advantage;
var gear_rad_final = pendulum_rad * final_advantage;
var tooth_height = gear_rad_init / 30;
var tooth_give_vert = tooth_height / 10;
var cycloid_rad = tooth_height * Math.PI;

// Start Drawing
//  Spiral Gear
var spiral_teeth_path = spiralArc([0, 0], gear_rad_final, gear_rad_init, start_angle, end_angle, -1);
var tooth_width = spiral_teeth_path.length / 40;
tooth_give_horz = tooth_width / tooth_give_horz;

var test_teeth = drawCycloidalGearTeeth(
    spiral_teeth_path.model,
    cycloid_rad,
    tooth_width,
    tooth_height,
    0,
    5,
    tooth_give_horz,
    tooth_give_vert,
    false,
    false,
    tooth_resolution,
);

var teeth_end = circlePoint([0, 0], gear_rad_final - 8.0 * tooth_height, end_angle);
var gear_line_top = new MakerJs.paths.Line([teeth_end, test_teeth.end]);

var teeth_start = circlePoint([0, 0], gear_rad_final - 8.0 * tooth_height, start_angle);
var gear_line_bottom = new MakerJs.paths.Line([teeth_start, test_teeth.start]);

var gear_center_mid = circlePoint([0, 0], gear_rad_final - 8.0 * tooth_height, 0);
var gear_center = new MakerJs.paths.Arc(teeth_start, gear_center_mid, teeth_end);

var center_hole = new MakerJs.paths.Circle(3);

var gear_model: IModel = {
    models: {
        spiral_gear: { layer: "red", ...spiral_teeth_path.model },
        teeth: test_teeth.model,
    },
    paths: {
        gear_center,
        gear_line_top,
        gear_line_bottom,
        center_hole,
    }
}

gear_model = MakerJs.model.rotate(gear_model, engagement_angle * 180 / Math.PI);

var top_gear_model = MakerJs.model.clone(gear_model);
var move_to = [0, arc_thickness + gear_rad_init * 2];
top_gear_model = MakerJs.model.rotate(top_gear_model, -2 * engagement_angle * 180 / Math.PI);
top_gear_model = MakerJs.model.move(top_gear_model, move_to);

var rel_point = circlePoint([0, 0], gear_rad_init, engagement_angle + Math.PI / 2)
var rel_circ = new MakerJs.paths.Circle(rel_point, 3);

var rack_origin = [0, -1.5 * pendulum_rad];
var rel_angle_rad = signed_dot(rack_origin, [0, 0], rel_point);
var relativised_engagement_angle = rel_angle_rad * 180 / Math.PI;
var rack = unrollSpiralOntoArc(
    rack_origin,
    -rack_origin[1] + gear_rad_init + gear_rad_final - tooth_height * 7.5,
    false,
    Math.PI / 2.0,
    1,
    [0, 0],
    gear_rad_final,
    gear_rad_init,
    start_angle,
    end_angle, -1
);

// rack.model = MakerJs.model.moveRelative(rack.model, [-rack.end[0] - tooth_width/2 - tooth_give_horz, tooth_give_vert]);
var rack_teeth = drawCycloidalGearTeeth(
    rack.model,
    cycloid_rad,
    tooth_width,
    tooth_height,
    0,
    5,
    tooth_give_horz,
    tooth_give_vert,
    false,
    false,
    tooth_resolution,
);

var rack_model: IModel = {
    models: {
        rack: { layer: "red", ...rack.model },
        rack_teeth: rack_teeth.model,
    }
}

rack_model = MakerJs.model.rotate(rack_model, relativised_engagement_angle, rack_origin);
var rack_hole = new MakerJs.paths.Circle(rack_origin, 3);
if (rack_model.paths == undefined) {
    rack_model.paths = {};
}
rack_model.paths["hole"] = rack_hole;

var top_rad =-rack_origin[1] + gear_rad_init + gear_rad_init +  arc_thickness + gear_rad_final - 10 * tooth_height;
var top_rack = unrollSpiralOntoArc(
    rack_origin,
    top_rad,
    false,
    Math.PI / 2.0,
    1,
    [0, 0],
    gear_rad_final,
    gear_rad_init,
    start_angle,
    end_angle, -1
);
top_rack.model = MakerJs.model.rotate(top_rack.model, relativised_engagement_angle * 2);

var top_rack_teeth = drawCycloidalGearTeeth(
    top_rack.model,
    cycloid_rad,
    tooth_width,
    tooth_height,
    0,
    5,
    tooth_give_horz,
    tooth_give_vert,
    false,
    true,
    tooth_resolution,
);

var top_rack_model : IModel = {
    models : {
        top_rack: { layer: "red",  ...top_rack.model},
        top_rack_teeth: top_rack_teeth.model,
    }
}

var pendulum_arc = new MakerJs.paths.Arc(rack_origin, top_rad, 75 - relativised_engagement_angle, 90);

var model: IModel = {
    models: {
        gear_model,
        top_gear_model,
        rack_model,
        top_rack_model,
    },
    paths: {
        pendulum_arc,
    }
};

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1mm",
    units: MakerJs.unitType.Millimeter
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("test.svg", svg, _ => { });