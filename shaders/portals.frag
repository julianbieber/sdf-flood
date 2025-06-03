#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0



const mat3 OKLAB2RGB_A = mat3(
    1.0,           1.0,           1.0,
    0.3963377774, -0.1055613458, -0.0894841775,
    0.2158037573, -0.0638541728, -1.2914855480);

const mat3 OKLAB2RGB_B = mat3(
    4.0767416621, -1.2684380046, -0.0041960863,
    -3.3077115913, 2.6097574011, -0.7034186147,
    0.2309699292, -0.3413193965, 1.7076147010);

vec3 oklab2rgb(vec3 oklab) {
    vec3 lms = OKLAB2RGB_A * oklab;
    return OKLAB2RGB_B * (lms * lms * lms);
}
vec4 oklab2rgb(vec4 oklab) { return vec4(oklab2rgb(oklab.xyz), oklab.a); }


vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}

float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float map(vec3 p, vec2 index) {
    return p.y + index.x + sin(p.x * index.x * index.y);
}

vec3 foldPlane(vec3 p, vec3 n, float d) {
    // signed distance from p to plane
    float dist = dot(p, n) + d;
    // if on positive side, reflect across plane
    if (dist < 0.0) {
        p -= 2.0 * dist * n;
    }
    return p;
}
// returns distance, index
vec3 portal_map(vec3 p, vec2 index) {
    float s = 6.3;
    vec3 id = (round(p.xyz/ s));
    vec3 lp_xz = p.xyz - s * id;
    // vec3 lp = vec3(lp_xz.x, p.y, lp_xz.y);
    vec3 lp = lp_xz;

    float d = 1e10;
    // for (float i = 0.0; i < 5.0; i += 1.0) {
    float ld;
    if (index == vec2(0.0)) {
        ld = sphere(lp, vec3(0.0), 1.0);
    } else {
        ld = sphere(lp, vec3(0.0), max(length(index), 0.1));
    }
        d = min(ld, d);
    // }

    return vec3(d, id.xz);
}

vec3 normal(vec3 p, vec2 index ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(map(p+h.xyy, index) - map(p-h.xyy, index),
                           map(p+h.yxy, index) - map(p-h.yxy, index),
                           map(p+h.yyx, index) - map(p-h.yyx, index) ) );
}
vec3 portal_normal(vec3 p, vec2 index) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(portal_map(p+h.xyy, index) - portal_map(p-h.xyy, index),
                           portal_map(p+h.yxy, index) - portal_map(p-h.yxy, index),
                           portal_map(p+h.yyx, index) - portal_map(p-h.yyx, index) ) );
}

vec3 cmap(float x) {
    return oklab2rgb(vec3(0.5, 0.1567, sin(x) * 0.5));
}

vec2 world_color(vec2 index) {
    return vec2(0.05, sin(length(index)));
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec2 index = vec2(0.0, 0.0);
    bool closeby_portal = false;
    float closest_to_portal = 1e10;
    bool portal_hit = false;
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;
        vec3 portal_d = portal_map(p, index);
        if (portal_d.x < 0.2) {
            closeby_portal = true;
            if (portal_d.x < closest_to_portal) {
                closest_to_portal = portal_d.x;
            }
        }
        if (portal_d.x < 0.001 ) {
            vec3 n = portal_normal(p, index);
            index = portal_d.yz;
            t = 0.0;
            closeby_portal = false;
            portal_hit = true;
            // rd = refract(rd, n, 0.4);
        }
        p = ro + rd * t;
        float d = map(p, index);
        if (d < 0.001 && index != vec2(0.0)) {
            if (closeby_portal) {
                return cmap(closest_to_portal);
            }
            vec3 n = normal(p, index);
            float l = max(0.1, dot(n, vec3(0.0, 1.0, 0.0)));
            return oklab2rgb(vec3(l, world_color(index)));
        }
        if (!portal_hit) {
            t += min(d,portal_d.x) * 0.8;
        } else {
            t += d;
        }
    }

    return vec3(0.0);
}


void main(){
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    ray_direction = rotate(ray_direction, 0.0, 0.1 * u.time, 0.0);

    // out_color = vec4(march(vec3(pixel_position + vec2(0.0, 3.0), -10.0) + vec3(0.1, 0.0, 0.2) * u.time, ray_direction), 1.0);
    out_color = vec4(oklab2rgb(vec3(sin(u.time) * 0.5 + 0.5, world_color(vec2(0.0, u.time)))), 1.0);
} 


