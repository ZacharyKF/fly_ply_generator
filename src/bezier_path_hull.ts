import MakerJs, { IModel, IPoint, models} from "makerjs";
import { atan2, max, pi, tan } from "mathjs";
import { ipoint_to_point, point_to_ipoint, project_to_dimm } from "./makerjs_tools";
import BezierJs, { Projection, Bezier, Point, utils, Closest } from "bezier-js";



/**
 * This hull is defined by:
 *  @member {number} total_width width of the hull, windward to leeward
 *  @member {number} total_length Length of the hull from centerboard to bow (at peak)
 *  @member {number} bow_rake Angle of the bow relative to negative Y axis in YX plane (clockwise)
 *  @member {number} asymmetry Percentage of width distributed to windward
 *  @member {number} horizontal_flat_length How far horizontal bezier curves' central control points are pushed towards the bow
 *  @member {number} gunnel_rise Height above the deck that the gunnels rise
 *  @member {number} main_curve_depth Depth of the hull's main curve
 *  @member {number} lower_curve_depth Depth of the hull's lower curve
 *  @member {number} hull_depth Depth at which hull is cut flat 
 */
export interface BezierPathHull {
    max_length: number,
    total_width: number,
    total_length: number,
    bow_rake: number,
    asymmetry: number,
    horizontal_flat_length: number,
    gunnel_rise: number,
    main_curve_depth: number,
    lower_curve_depth: number,
    hull_depth: number,
    lee_gunnel_bezier: models.BezierCurve,
    wind_gunnel_bezier: models.BezierCurve,
    upper_bezier: models.BezierCurve,
    lower_bezier: models.BezierCurve,
}

export function buildBezierPathHull(
        total_width: number,
        total_length: number,
        bow_rake: number,
        asymmetry: number,
        horizontal_flat_length: number,
        gunnel_rise: number,
        main_curve_depth: number,
        lower_curve_depth: number,
        hull_depth: number,
    ) : BezierPathHull {

    let rake_rad = bow_rake * pi/180.0;
    let bow_tip_length = total_length + tan(rake_rad) * gunnel_rise;
    let max_length = max(total_length, bow_tip_length);

    /**
     * The bow tip is where all curves meet
     */
    let bow_tip: IPoint = [
        bow_tip_length,
        gunnel_rise,
        0
    ];

    /**
     * The gunnel lines are used to determine the top of the hull
     */
    let lee_asymmetry = 1 - asymmetry;
    let lee_gunnel_points: IPoint[] = [
        [   0, 
            0, 
            lee_asymmetry * total_width
        ],
        [   total_length * horizontal_flat_length,
            0,
            lee_asymmetry * total_width
        ],
        bow_tip,
    ];
    let lee_gunnel_bezier = new models.BezierCurve(lee_gunnel_points);

    let wind_gunnel_points: IPoint[] = [
            [   0, 
                0, 
                -asymmetry * total_width
            ],
            [   total_length * horizontal_flat_length,
                0,
                -asymmetry * total_width
            ],
            bow_tip,
        ];
    let wind_gunnel_bezier = new models.BezierCurve(wind_gunnel_points);
    
    /**
     * The upper bezier determines where the center of the side panel curves lies
     */
    let upper_bezier_points: IPoint[] = [
        [
            0,
            -main_curve_depth,
            0,
        ],
        [
            total_length - (main_curve_depth * tan(rake_rad)),
            -main_curve_depth,
            0,
        ],
        bow_tip,
    ];
    let upper_bezier = new models.BezierCurve(upper_bezier_points); 

    /**
     * The lower curve determines the limit of the hull side bezier curves, the second point is along the line of the 
     *  bow
     */
    let lower_bezier_points: IPoint[] = [
        [
            0,
            -lower_curve_depth,
            0,
        ],
        [
            total_length - (lower_curve_depth * tan(rake_rad)),
            -lower_curve_depth,
            0,
        ],
        bow_tip,
    ];
    let lower_bezier = new models.BezierCurve(lower_bezier_points); 

    /**
     * Function wrappers
     */

    return {
        max_length,
        total_width,
        total_length,
        bow_rake,
        asymmetry,
        horizontal_flat_length,
        gunnel_rise,
        main_curve_depth,
        lower_curve_depth,
        hull_depth,
        lee_gunnel_bezier,
        wind_gunnel_bezier,
        upper_bezier,
        lower_bezier,
    }
}

export function get_panel_curves_at_dist(hull: BezierPathHull, dist: number): [models.BezierCurve, models.BezierCurve] {
    
    let get_point = function(b: models.BezierCurve){ return project_to_dimm(b, 0, dist)};

    // Gunnel points
    let lee_gunnel = get_point(hull.lee_gunnel_bezier);
    let wind_gunnel = get_point(hull.wind_gunnel_bezier);

    // Center points
    let center_curve = get_point(hull.upper_bezier);
    let lee_side = {...center_curve};
    lee_side[2] = lee_gunnel[2];
    let wind_side = {...center_curve};
    wind_side[2] = wind_gunnel[2];

    // Bottom point
    let bottom_point = get_point(hull.lower_bezier);

    return [
        new models.BezierCurve([lee_gunnel, lee_side, bottom_point]),
        new models.BezierCurve([wind_gunnel, wind_side, bottom_point]), 
    ]
}

export function get_hull_curves_at_dist(hull: BezierPathHull, dist: number): [
    IPoint[],
    IPoint[],
] {
    let [curve_lee, curve_wind] = get_panel_curves_at_dist(hull, dist);

    let lee_out: IPoint[] = [];
    let lee_points: Point[] = [curve_lee.seed.origin, ...curve_lee.seed.controls, curve_lee.seed.end].map(ipoint_to_point);
    let bezier_lee = new Bezier(lee_points);
    let wind_out: IPoint[] = [];
    let wind_points: Point[] = [curve_wind.seed.origin, ...curve_wind.seed.controls, curve_wind.seed.end].map(ipoint_to_point);
    let bezier_wind = new Bezier(wind_points);

    let step = 0.0001;
    for (let i = 0.0; i <= 1.0; i+= step) {
        lee_out.push(point_to_ipoint(bezier_lee.compute(i)));
        wind_out.push(point_to_ipoint(bezier_wind.compute(i)));
    }

    lee_out = lee_out.filter((val, idx, arr) => {
        return Math.abs(val[1]) < hull.hull_depth;
    });

    let lee_first = lee_out.shift();
    let lee_last = lee_out.pop();

    lee_out = lee_out.filter((val, idx, arr) => {
        return idx % 100 == 0;
    });

    if (lee_first != null && lee_last != null) {
        lee_out.unshift(lee_first);
        lee_out.push(lee_last);
    }

    wind_out = wind_out.filter((val, idx, arr) => {
        return Math.abs(val[1]) < hull.hull_depth;
    });

    let wind_first = wind_out.shift();
    let wind_last = wind_out.pop();

    wind_out = wind_out.filter((val, idx, arr) => {
        return idx % 100 == 0;
    });

    if (wind_first != null && wind_last != null) {
        wind_out.unshift(wind_first);
        wind_out.push(wind_last);
    }

    return [
        lee_out,
        wind_out
    ];
}